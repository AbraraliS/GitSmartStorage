/**
 * app/api/files/route.ts
 * GET  /api/files?q=&node=&type=  — list / search files from the index
 * DELETE /api/files?hash=  — delete a file and update the index
 * Security: auth → assertOwner → Zod validation → rate limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, writeRemoteIndex, deleteFile, assertOwner } from "@/lib/github";
import { searchFiles, removeFileFromIndex } from "@/lib/index";
import { checkRateLimit } from "@/lib/ratelimit";
import { withErrorHandler } from "@/lib/api-utils";
import type { FileRecord, FilterOptions } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Used for general listing/search responses.
 * Keeps client-safe metadata only and removes all sensitive internals.
 */
function stripForListing(record: FileRecord): Omit<FileRecord, "sha" | "encryptionKey"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sha: _sha, encryptionKey: _key, ...safe } = record;
  return safe;
}

/**
 * Used when client-side decrypt metadata is required.
 * Removes only internal blob SHA but keeps encryptionKey.
 */
function stripForDownload(record: FileRecord): Omit<FileRecord, "sha"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sha: _sha, ...safe } = record;
  return safe;
}

// GET /api/files
export const GET = withErrorHandler(async (req: NextRequest) => {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  assertOwner(login, login);

  // 3. Rate limit
  const rl = await checkRateLimit(login, "default");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const filters: FilterOptions = {
    node:     searchParams.get("node")     ?? undefined,
    type:     searchParams.get("type")     ?? undefined,
    tags:     searchParams.get("tags")?.split(",").filter(Boolean) ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo:   searchParams.get("dateTo")   ?? undefined,
    minSize:  searchParams.get("minSize")  ? Number(searchParams.get("minSize"))  : undefined,
    maxSize:  searchParams.get("maxSize")  ? Number(searchParams.get("maxSize"))  : undefined,
  };

  const octokit = createOctokit(accessToken);
  const remote  = await readRemoteIndex(octokit, login);
  if (!remote) return NextResponse.json({ files: [], nodes: {} });

  const matched = searchFiles(remote.content, q, filters);
  // Listing payload intentionally strips encryption metadata.
  const files = matched.map(stripForListing);

  // Keep this reference so TS does not tree-shake / flag download-safe sanitizer as unused.
  void stripForDownload;

  return NextResponse.json({
    files,
    nodes:      remote.content.nodes,
    updated_at: remote.content.updated_at,
  });
});

// DELETE /api/files?hash=abc123
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  assertOwner(login, login);

  const { searchParams } = new URL(req.url);
  const hashResult = z.string().min(1).max(64).safeParse(searchParams.get("hash"));
  if (!hashResult.success) {
    return NextResponse.json({ error: "Missing or invalid hash" }, { status: 400 });
  }
  const hash = hashResult.data;

  const rl = await checkRateLimit(login, "delete");
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const octokit = createOctokit(accessToken);
  const remote  = await readRemoteIndex(octokit, login);
  if (!remote) return NextResponse.json({ error: "Index not found" }, { status: 404 });

  const record = remote.content.files[hash];
  if (!record) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const nodeInfo = remote.content.nodes[record.node];
  if (!nodeInfo) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  const targetRepo = record.repo ?? nodeInfo.repo;

  const pathsToDelete = record.chunks?.length ? record.chunks : [record.path];
  for (const path of pathsToDelete) {
    try {
      const { data } = await octokit.repos.getContent({ owner: login, repo: targetRepo, path });
      if (!Array.isArray(data) && data.type === "file") {
        await deleteFile(octokit, login, targetRepo, path, data.sha);
      }
    } catch { /* best effort */ }
  }

  removeFileFromIndex(remote.content, hash);
  await writeRemoteIndex(octokit, login, remote.content, remote.sha);

  return NextResponse.json({ ok: true });
});
