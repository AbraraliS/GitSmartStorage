/**
 * app/api/upload/chunk/route.ts
 * PUT /api/upload/chunk — receive a binary chunk and write it to GitHub.
 *
 * Transport protocol (v2 — binary):
 *   Content-Type: application/octet-stream
 *   x-repo:        target GitHub repo name
 *   x-chunk-path:  path inside the repo (e.g. "2026/05/abc123_file.mp4")
 *   x-sha:         (optional) existing blob SHA for updates
 *   Body:          raw binary bytes of the chunk (no base64, no JSON)
 *
 * Server responsibility:
 *   Buffer.from(arrayBuffer).toString('base64') — Node.js native, efficient
 *   → putFile() → GitHub Contents API (which requires base64)
 *
 * Legacy fallback (v1 — JSON):
 *   Content-Type: application/json
 *   Body: { repo, path, content (base64 string), sha? }
 *   Accepted for backward compat; old clients continue to work.
 *
 * Security: auth → assertOwner → validation → rate limit (10 uploads/60 s).
 *
 * Body size: 80MB binary → 150MB limit gives headroom.
 * maxDuration: GitHub Contents API is slow for large blobs (5 min timeout).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createOctokit, putFile, assertOwner, ensureRepo } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

// ─── Route config ─────────────────────────────────────────────────────────────

export const maxDuration = 300; // 5 min — GitHub blob commits can be slow

// NOTE: Next.js App Router Route Handlers do NOT use the `export const config`
// object from pages/api. Body size for App Router routes is controlled via
// next.config.ts experimental.serverActions.bodySizeLimit (affects all routes).
// The 150mb limit set there covers this route.

// ─── Legacy JSON schema (v1 backward compat) ──────────────────────────────────

const LegacyChunkSchema = z.object({
  repo:    z.string().min(1).max(100),
  path:    z.string().min(1).max(500),
  content: z.string().min(1),
  sha:     z.string().optional(),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

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

  // 3. Rate limit — 10 chunk uploads / 60 s per user
  const rl = await checkRateLimit(login, "upload");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests — slow down" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // 4. Parse request — support both binary (v2) and JSON (v1 legacy)
  let repo: string;
  let chunkPath: string;
  let existingSha: string | undefined;
  let base64Content: string;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.startsWith("application/octet-stream")) {
    // ── Binary transport (v2) ─────────────────────────────────────────────
    // Metadata arrives in HTTP headers — no JSON parsing overhead.
    repo      = req.headers.get("x-repo") ?? "";
    chunkPath = req.headers.get("x-chunk-path") ?? "";
    existingSha = req.headers.get("x-sha") ?? undefined;

    if (!repo || !chunkPath) {
      return NextResponse.json(
        { error: "Missing required headers: x-repo, x-chunk-path" },
        { status: 400 }
      );
    }
    if (repo.length > 100 || chunkPath.length > 500) {
      return NextResponse.json({ error: "Header value too long" }, { status: 400 });
    }

    // Read binary body ONCE — no duplication, no JSON parsing
    const arrayBuffer = await req.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty chunk body" }, { status: 400 });
    }

    // Server-side base64 — Node.js Buffer is ~10× faster than browser FileReader
    // and does NOT allocate a JS string on the heap before encoding.
    base64Content = Buffer.from(arrayBuffer).toString("base64");

    console.debug(
      `[chunk] binary v2: ${repo}/${chunkPath} ` +
      `(${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB binary ` +
      `→ ${(base64Content.length / 1024 / 1024).toFixed(1)} MB base64)`
    );
  } else {
    // ── Legacy JSON transport (v1) ────────────────────────────────────────
    // Accepted for backward compat with old clients.
    let body: z.infer<typeof LegacyChunkSchema>;
    try {
      body = LegacyChunkSchema.parse(await req.json());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid request body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    repo = body.repo;
    chunkPath = body.path;
    existingSha = body.sha;
    base64Content = body.content;

    console.debug(`[chunk] json v1 (legacy): ${repo}/${chunkPath}`);
  }

  // 5. GitHub write (same logic regardless of transport)
  try {
    const octokit = createOctokit(accessToken);

    const writeChunk = async (resolvedSha?: string) =>
      putFile(octokit, {
        owner: login,
        repo,
        path: chunkPath,
        content: base64Content,
        sha: resolvedSha,
      });

    let blobSha: string;
    try {
      blobSha = await writeChunk(existingSha);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;

      if (status === 404) {
        // Repo missing — create it then retry
        await ensureRepo(octokit, login, repo);
        blobSha = await writeChunk(existingSha);
      } else if ((status === 409 || status === 422) && !existingSha) {
        // Conflict — file exists, get its SHA and overwrite
        try {
          const existing = await octokit.repos.getContent({
            owner: login,
            repo,
            path: chunkPath,
          });
          if (!Array.isArray(existing.data) && existing.data.type === "file") {
            blobSha = await writeChunk(existing.data.sha);
          } else {
            await new Promise((r) => setTimeout(r, 2000));
            blobSha = await writeChunk(undefined);
          }
        } catch (getErr: unknown) {
          const getStat = (getErr as { status?: number })?.status;
          if (getStat === 404) {
            await new Promise((r) => setTimeout(r, 3000));
            blobSha = await writeChunk(undefined);
          } else {
            throw err;
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
    console.error(`[chunk] GitHub write failed: ${message}`, { status });
    return NextResponse.json(
      { error: message, status: status ?? 500 },
      { status: status && status >= 400 && status < 600 ? status : 500 }
    );
  }
}
