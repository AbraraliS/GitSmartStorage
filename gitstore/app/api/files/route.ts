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
import type { FileRecord, FilterOptions } from "@/types";

/** Strip internal GitHub blob SHA and encryption key before sending FileRecords to the client. */
function stripSensitiveFields(record: FileRecord): Omit<FileRecord, "sha" | "encryptionKey"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sha: _sha, encryptionKey: _key, ...safe } = record;
  return safe;
}

// GET /api/files
export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  try {
    const octokit = createOctokit(accessToken);
    const remote  = await readRemoteIndex(octokit, login);
    if (!remote) return NextResponse.json({ files: [], nodes: {} });

    const matched = searchFiles(remote.content, q, filters);
    // Strip internal sha from every record before sending to client
    const files = matched.map(stripSensitiveFields);

    return NextResponse.json({
      files,
      nodes:      remote.content.nodes,
      updated_at: remote.content.updated_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/files?hash=abc123
export async function DELETE(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login       = (session as unknown as Record<string, string>).login;

  // 2. Owner assertion
  try { assertOwner(login, login); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Zod — validate hash query param
  const { searchParams } = new URL(req.url);
  const hashResult = z.string().min(1).max(64).safeParse(searchParams.get("hash"));
  if (!hashResult.success) {
    return NextResponse.json({ error: "Missing or invalid hash" }, { status: 400 });
  }
  const hash = hashResult.data;

  // 4. Rate limit — 20 deletes / 60 s per user
  const rl = await checkRateLimit(login, "delete");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const octokit = createOctokit(accessToken);
    const remote  = await readRemoteIndex(octokit, login);
    if (!remote) return NextResponse.json({ error: "Index not found" }, { status: 404 });

    const record = remote.content.files[hash];
    if (!record) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const nodeInfo = remote.content.nodes[record.node];
    if (!nodeInfo) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    // Delete actual file(s) from data node repo
    const pathsToDelete = record.chunks?.length ? record.chunks : [record.path];
    for (const path of pathsToDelete) {
      try {
        const { data } = await octokit.repos.getContent({
          owner: login,
          repo:  nodeInfo.repo,
          path,
        });
        if (!Array.isArray(data) && data.type === "file") {
          await deleteFile(octokit, login, nodeInfo.repo, path, data.sha);
        }
      } catch {
        // Best-effort deletion — continue even if individual chunk missing
      }
    }

    // Remove from index and write once
    removeFileFromIndex(remote.content, hash);
    await writeRemoteIndex(octokit, login, remote.content, remote.sha);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
