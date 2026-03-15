/**
 * app/api/bootstrap/route.ts
 * POST /api/bootstrap — called on first login to create system repos + initial index.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOctokit,
  bootstrapSystemRepos,
  readRemoteIndex,
  writeRemoteIndex,
} from "@/lib/github";
import { emptyIndex, addNodeToIndex } from "@/lib/index";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  try {
    const octokit = createOctokit(accessToken);

    // Step 1: Create gitstore-master, gitstore-secondary, gitstore-documents
    await bootstrapSystemRepos(octokit, login);

    // Step 2: Check if index.json already exists
    const existing = await readRemoteIndex(octokit, login);
    if (existing) {
      // Already bootstrapped
      return NextResponse.json({ ok: true, bootstrapped: false, index: existing.content });
    }

    // Step 3: Create initial empty index with default documents node
    const index = emptyIndex();
    addNodeToIndex(index, {
      id: "documents",
      repo: "gitstore-documents",
      size_mb: 0,
      created: new Date().toISOString(),
    });

    await writeRemoteIndex(octokit, login, index);

    return NextResponse.json({ ok: true, bootstrapped: true, index });
  } catch (err) {
    console.error("[bootstrap] Error:", err);
    const message = err instanceof Error ? err.message : "Bootstrap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
