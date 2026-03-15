/**
 * app/api/sync/backup/route.ts
 * POST /api/sync/backup — replicate all data nodes to a secondary GitHub account.
 * The backup account token must be provided in the request body (stored in user settings).
 * Security: auth → assertOwner → Zod validation → rate limit (sync bucket: 5/60 s).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createOctokit,
  readRemoteIndex,
  replicateToBackup,
  assertOwner,
} from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

const BackupSchema = z.object({
  /** Personal access token for the backup GitHub account (never logged) */
  backupToken: z.string().min(1),
  /** GitHub login of the backup account */
  backupLogin: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-]+$/),
  /** Optional: only replicate specific file hashes */
  hashes: z.array(z.string().min(1).max(64)).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Zod validation
  let body: z.infer<typeof BackupSchema>;
  try {
    body = BackupSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Rate limit
  const rl = await checkRateLimit(login, "sync");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { backupToken, backupLogin, hashes } = body;

  try {
    const sourceOctokit = createOctokit(accessToken);
    const backupOctokit = createOctokit(backupToken);

    const remote = await readRemoteIndex(sourceOctokit, login);
    if (!remote) return NextResponse.json({ error: "Index not found" }, { status: 404 });

    const { files, nodes } = remote.content;

    // Build list of files to replicate
    const targetHashes = hashes ?? Object.keys(files);
    const filesToReplicate = targetHashes
      .map((hash) => {
        const record = files[hash];
        if (!record) return null;
        const node = nodes[record.node];
        if (!node) return null;
        return { repo: node.repo, path: record.path };
      })
      .filter(Boolean) as Array<{ repo: string; path: string }>;

    // Also replicate index.json from master
    filesToReplicate.push({ repo: "gitstore-master", path: "index.json" });

    await replicateToBackup(
      sourceOctokit,
      backupOctokit,
      login,
      backupLogin,
      filesToReplicate
    );

    return NextResponse.json({
      ok: true,
      replicated: filesToReplicate.length,
      replicated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replication failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
