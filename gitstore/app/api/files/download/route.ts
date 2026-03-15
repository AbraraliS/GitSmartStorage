/**
 * app/api/files/download/route.ts
 * GET /api/files/download?hash=  — proxy-download a file through the server.
 * Always goes through the server so the GitHub token is never exposed.
 * Security: auth → assertOwner → Zod validation → rate limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, readRemoteIndex, assertOwner } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

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

  // 3. Zod — validate hash query param
  const { searchParams } = new URL(req.url);
  const hashResult = z.string().min(1).max(64).safeParse(searchParams.get("hash"));
  if (!hashResult.success) {
    return NextResponse.json({ error: "Missing or invalid hash" }, { status: 400 });
  }
  const hash = hashResult.data;

  // 4. Rate limit
  const rl = await checkRateLimit(login, "default");
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

    // For chunked files, download all chunks, reassemble, and stream
    const paths = record.chunks?.length ? record.chunks : [record.path];
    const buffers: Buffer[] = [];

    for (const path of paths) {
      const { data } = await octokit.repos.getContent({
        owner: login,
        repo:  nodeInfo.repo,
        path,
      });

      if (Array.isArray(data) || data.type !== "file") {
        return NextResponse.json({ error: "Invalid file data" }, { status: 500 });
      }

      buffers.push(Buffer.from(data.content, "base64"));
    }

    const combined = Buffer.concat(buffers);

    return new NextResponse(combined, {
      headers: {
        "Content-Type":        record.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${record.name}"`,
        "Content-Length":      combined.length.toString(),
        "Cache-Control":       "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
