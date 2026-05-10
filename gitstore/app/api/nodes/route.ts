/**
 * app/api/nodes/route.ts
 * GET  /api/nodes  — list all data nodes from the index
 * POST /api/nodes  — create a new data node repo
 * Security: auth → assertOwner → Zod validation → rate limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createOctokit,
  createDataNodeRepo,
  readRemoteIndex,
  writeRemoteIndex,
  assertOwner,
} from "@/lib/github";
import { emptyIndex, addNodeToIndex } from "@/lib/index";
import { checkRateLimit } from "@/lib/ratelimit";

const CreateNodeSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Node name must contain only lowercase letters, numbers, and dashes"),
});

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
    const nodes   = remote?.content.nodes ?? {};
    return NextResponse.json({ nodes: Object.values(nodes) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list nodes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
  let body: z.infer<typeof CreateNodeSchema>;
  try {
    body = CreateNodeSchema.parse(await req.json());
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

  const { name } = body;

  try {
    const octokit = createOctokit(accessToken);
    const remote = await readRemoteIndex(octokit, login);
    const index  = remote?.content ?? emptyIndex();
    const node    = await createDataNodeRepo(octokit, login, name, index);

    // Update the index
    addNodeToIndex(index, node);
    await writeRemoteIndex(octokit, login, index, remote?.sha);

    return NextResponse.json({ node });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create node";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
