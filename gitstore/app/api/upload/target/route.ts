import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { assertOwner, createOctokit, getOrCreateCurrentShard, readRemoteIndex, writeRemoteIndex } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";

const UploadTargetSchema = z.object({
  nodeId: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  try {
    assertOwner(login, login);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof UploadTargetSchema>;
  try {
    body = UploadTargetSchema.parse(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(login, "upload");
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const octokit = createOctokit(accessToken);
    const remote = await readRemoteIndex(octokit, login);
    if (!remote) {
      return NextResponse.json({ error: "Index not found" }, { status: 404 });
    }

    const repo = await getOrCreateCurrentShard(octokit, login, remote.content, body.nodeId);
    await writeRemoteIndex(octokit, login, remote.content, remote.sha);

    return NextResponse.json({ repo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve upload target" },
      { status: 500 }
    );
  }
}