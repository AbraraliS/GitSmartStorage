/**
 * app/api/upload/chunk/route.ts
 * PUT /api/upload/chunk — write a single base64-encoded chunk to a GitHub repo.
 * Security: auth → assertOwner → Zod validation → rate limit (10 uploads/60 s).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, putFile, assertOwner, ensureRepo } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

const ChunkSchema = z.object({
  repo:    z.string().min(1).max(100),
  path:    z.string().min(1).max(500),
  content: z.string().min(1),
  sha:     z.string().optional(),
});

export async function PUT(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  if (!accessToken || !login) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 401 });
  }

  // 2. Owner assertion
  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Zod validation
  let body: z.infer<typeof ChunkSchema>;
  try {
    body = ChunkSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Rate limit — 10 chunk uploads / 60 s per user
  const rl = await checkRateLimit(login, "upload");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests — slow down" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { repo, path, content, sha } = body;

  try {
    const octokit = createOctokit(accessToken);

    const writeChunk = async (resolvedSha?: string) =>
      putFile(octokit, { owner: login, repo, path, content, sha: resolvedSha });

    let blobSha: string;
    try {
      blobSha = await writeChunk(sha);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;

      if (status === 404) {
        // Repo can be missing if index points to a shard created elsewhere.
        await ensureRepo(octokit, login, repo);
        blobSha = await writeChunk(sha);
      } else if ((status === 409 || status === 422) && !sha) {
        // Try to get the existing file's SHA in case it already exists
        try {
          const existing = await octokit.repos.getContent({ owner: login, repo, path });
          if (!Array.isArray(existing.data) && existing.data.type === "file") {
            // File exists — overwrite it with correct SHA
            blobSha = await writeChunk(existing.data.sha);
          } else {
            // Unexpected response shape — retry from scratch after delay
            await new Promise((r) => setTimeout(r, 2000));
            blobSha = await writeChunk(undefined);
          }
        } catch (getErr: unknown) {
          const getStat = (getErr as { status?: number })?.status;
          if (getStat === 404) {
            // File doesn't exist yet — repo may still be initializing
            // Wait and retry the original write without a SHA
            await new Promise((r) => setTimeout(r, 3000));
            blobSha = await writeChunk(undefined);
          } else {
            throw err; // unexpected error — surface it
          }
        }
      } else {
        throw err;
      }
    }

    return NextResponse.json({ ok: true, sha: blobSha });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { error: message, status: status ?? 500 },
      { status: status && status >= 400 && status < 600 ? status : 500 }
    );
  }
}
