/**
 * app/api/upload/finalize/route.ts
 * POST /api/upload/finalize — create a single Git commit from uploaded blobs.
 *
 * After all chunk blobs are uploaded via POST /api/upload/blob (which returns
 * blobSha per chunk), call this route once to:
 *   1. Get current HEAD commit + tree SHA
 *   2. Create a new tree containing all blob paths
 *   3. Create a single commit referencing the new tree
 *   4. Fast-forward the branch ref
 *
 * This means N chunks = N blob uploads + 1 commit, not N commits.
 *
 * Body (JSON):
 * {
 *   repo: string,
 *   blobs: Array<{ path: string; blobSha: string }>,
 *   message?: string   // optional commit message
 * }
 *
 * Response: { commitSha: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createOctokit,
  assertOwner,
  ensureRepo,
  getRepoHead,
  buildGitTree,
  createGitCommit,
  updateBranchRef,
} from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 120;

const FinalizeSchema = z.object({
  repo:    z.string().min(1).max(100),
  blobs:   z.array(z.object({
    path:    z.string().min(1).max(500),
    blobSha: z.string().length(40),
  })).min(1).max(200),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  if (!accessToken || !login) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 401 });
  }

  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Rate limit (finalize counts as 1 upload event regardless of chunk count)
  const rl = await checkRateLimit(login, "upload");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // 3. Parse body
  let body: z.infer<typeof FinalizeSchema>;
  try {
    body = FinalizeSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { repo, blobs, message } = body;
  const commitMessage = message ?? `chore: upload ${blobs.length} chunk(s)`;

  console.info(`[finalize] ${repo}: ${blobs.length} blob(s) → 1 commit`);
  const t0 = Date.now();

  try {
    const octokit = createOctokit(accessToken);

    // Ensure repo is initialized (must exist with at least 1 commit for git refs to work)
    await ensureRepo(octokit, login, repo);

    // Get current HEAD — needed for base_tree and parent commit
    let head: { commitSha: string; treeSha: string };
    try {
      head = await getRepoHead(octokit, login, repo);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404 || status === 409) {
        // Repo just created via ensureRepo (auto_init) — retry once
        await new Promise((r) => setTimeout(r, 2000));
        head = await getRepoHead(octokit, login, repo);
      } else {
        throw err;
      }
    }

    // Create tree containing all uploaded blobs
    const treeSha = await buildGitTree(octokit, login, repo, head.treeSha, blobs);

    // Create the single commit
    const commitSha = await createGitCommit(
      octokit, login, repo, commitMessage, treeSha, head.commitSha
    );

    // Update branch ref (fast-forward only)
    try {
      await updateBranchRef(octokit, login, repo, commitSha, false);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // 422 means the branch moved while we were uploading blobs.
      // This is a race — retry with force=true as a last resort.
      if (status === 422) {
        console.warn(`[finalize] ref conflict for ${repo}, retrying with force`);
        await updateBranchRef(octokit, login, repo, commitSha, true);
      } else {
        throw err;
      }
    }

    const elapsed = Date.now() - t0;
    console.info(`[finalize] done: commitSha=${commitSha.slice(0, 8)} in ${elapsed}ms`);

    return NextResponse.json({ commitSha });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : "Finalize failed";
    console.error(`[finalize] failed: ${message}`, { repo, status });
    return NextResponse.json(
      { error: message },
      { status: status && status >= 400 && status < 600 ? status : 500 }
    );
  }
}
