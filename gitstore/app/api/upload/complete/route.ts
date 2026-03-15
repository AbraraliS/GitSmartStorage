/**
 * app/api/upload/complete/route.ts
 * POST /api/upload/complete — after all chunks are uploaded, write the index entry.
 * This is the ONLY place index.json is written per upload batch.
 * Security: auth → assertOwner → Zod validation → rate limit (default bucket).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, writeRemoteIndex, assertOwner } from "@/lib/github";
import {
  emptyIndex,
  addFileToIndex,
  incrementNodeSize,
} from "@/lib/index";
import { checkRateLimit } from "@/lib/ratelimit";

const FileRecordSchema = z.object({
  hash:        z.string().min(1).max(64),
  name:        z.string().min(1).max(500),
  node:        z.string().min(1).max(100),
  path:        z.string().min(1).max(500),
  size:        z.number().int().nonnegative(),
  type:        z.string().min(1).max(100),
  tags:        z.array(z.string()).default([]),
  created:     z.string(),
  sync_status: z.enum(["synced", "syncing", "error", "pending"]),
  chunks:      z.array(z.string()).optional(),
  lfs:         z.boolean().optional(),
  sha:         z.string().optional(),
  iv:          z.string().optional(),
});

const CompleteSchema = z.object({
  records: z.array(FileRecordSchema).min(1).max(200),
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
  let body: z.infer<typeof CompleteSchema>;
  try {
    body = CompleteSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Rate limit
  const rl = await checkRateLimit(login, "default");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { records } = body;

  try {
    const octokit = createOctokit(accessToken);

    // Read current index (or start fresh)
    const remote = await readRemoteIndex(octokit, login);
    const index = remote?.content ?? emptyIndex();
    const masterSha = remote?.sha;

    // Batch-add all uploaded file records
    for (const record of records) {
      addFileToIndex(index, { ...record, sync_status: "synced" });
      incrementNodeSize(index, record.node, record.size);
    }

    // Write index ONCE (never per-file)
    await writeRemoteIndex(octokit, login, index, masterSha);

    return NextResponse.json({ ok: true, count: records.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Index write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
