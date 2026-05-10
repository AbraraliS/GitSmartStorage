/**
 * app/api/sync/route.ts
 * POST /api/sync — trigger an index sync (master → secondary) manually
 * GET  /api/sync — return current index.json from master repo
 * Security: auth → assertOwner → rate limit (sync bucket: 5/60 s).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOctokit,
  readRemoteIndex,
  writeRemoteIndex,
  assertOwner,
} from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

// GET /api/sync — fetch fresh index from GitHub
export async function GET() {
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
  const rl = await checkRateLimit(login, "sync");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const octokit = createOctokit(accessToken);
    const remote  = await readRemoteIndex(octokit, login);
    return NextResponse.json({ index: remote?.content ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/sync — force-sync master → secondary
export async function POST() {
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
  const rl = await checkRateLimit(login, "sync");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const octokit = createOctokit(accessToken);

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const remote = await readRemoteIndex(octokit, login);
        if (!remote) return NextResponse.json({ error: "Master index not found" }, { status: 404 });

        // writeRemoteIndex mirrors master → secondary
        await writeRemoteIndex(octokit, login, remote.content, remote.sha);
        return NextResponse.json({ ok: true, synced_at: new Date().toISOString() });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const isConflict = status === 409 || status === 422;
        if (isConflict && attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, 150 * 2 ** (attempt - 1)));
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json({ error: "Sync conflict after retries" }, { status: 409 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
