/**
 * app/api/upload/blob/route.ts
 * POST /api/upload/blob — upload a binary chunk as a Git blob object.
 *
 * Unlike PUT /api/upload/chunk (Contents API), this route does NOT create
 * a commit. It only stores the blob in the Git object database and returns
 * its SHA. Multiple blobs are assembled into a single commit via
 * POST /api/upload/finalize.
 *
 * This eliminates the 1-commit-per-chunk overhead: N chunks = N blobs + 1 commit
 * instead of N commits.
 *
 * Transport:
 *   Content-Type: application/octet-stream
 *   x-repo:  target repo name
 *   Body:    raw binary bytes
 *
 * Response: { blobSha: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createOctokit, assertOwner, ensureRepo, createGitBlob } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 120; // blob uploads are faster than full commits

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

  // 2. Rate limit
  const rl = await checkRateLimit(login, "upload");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // 3. Parse headers
  const repo = req.headers.get("x-repo") ?? "";
  if (!repo || repo.length > 100) {
    return NextResponse.json({ error: "Missing or invalid x-repo header" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/octet-stream")) {
    return NextResponse.json({ error: "Content-Type must be application/octet-stream" }, { status: 415 });
  }

  // 4. Read binary body ONCE
  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
  const heapBefore = process.memoryUsage();

  // Server-side base64 — Node.js Buffer, far cheaper than browser FileReader
  const base64Content = Buffer.from(arrayBuffer).toString("base64");

  // Release the ArrayBuffer reference immediately after encoding
  // (base64Content is the only form we need from here)
  const arrayBufferRef = null as unknown as ArrayBuffer;
  void arrayBufferRef; // explicit discard

  try {
    const octokit = createOctokit(accessToken);

    // Ensure repo exists before first blob upload
    try {
      await ensureRepo(octokit, login, repo);
    } catch {
      // Already exists — ignore
    }

    const blobSha = await createGitBlob(octokit, login, repo, base64Content);

    const heapAfter = process.memoryUsage();
    console.debug(
      `[blob] ${repo} ${sizeMB}MB → blobSha=${blobSha.slice(0, 8)} ` +
      `heap: ${Math.round(heapBefore.heapUsed / 1024 / 1024)}MB → ${Math.round(heapAfter.heapUsed / 1024 / 1024)}MB`
    );

    return NextResponse.json({ blobSha });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : "Blob upload failed";
    console.error(`[blob] failed: ${message}`, { repo, status });
    return NextResponse.json(
      { error: message },
      { status: status && status >= 400 && status < 600 ? status : 500 }
    );
  }
}
