import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOctokit,
  bootstrapSystemRepos,
  readRemoteIndex,
  writeRemoteIndex,
} from "@/lib/github";
import { emptyIndex, addNodeToIndex } from "@/lib/index";
import { withErrorHandler } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as any).accessToken;
  const login = (session as any).login;

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
}

export const POST = withErrorHandler(handler);
