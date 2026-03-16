import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { assertOwner, createOctokit, readRemoteIndex, writeRemoteIndex } from "@/lib/github";
import { checkRateLimit } from "@/lib/ratelimit";
import { createFolder, deleteFolder, emptyIndex } from "@/lib/index";

const CreateFolderSchema = z.object({
  path: z.string().min(1).max(500),
  node: z.string().min(1).max(100),
});

const DeleteFolderSchema = z.object({
  path: z.string().min(1).max(500),
});

async function getRequestContext() {
  const session = await auth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  try {
    assertOwner(login, login);
  } catch {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const rl = await checkRateLimit(login, "default");
  if (rl.limited) {
    return {
      error: NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      ),
    };
  }

  return { accessToken, login };
}

export async function POST(req: NextRequest) {
  const context = await getRequestContext();
  if ("error" in context) return context.error;

  let body: z.infer<typeof CreateFolderSchema>;
  try {
    body = CreateFolderSchema.parse(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const octokit = createOctokit(context.accessToken);
    const remote = await readRemoteIndex(octokit, context.login);
    const index = remote?.content ?? emptyIndex();
    const folder = createFolder(index, body.path, body.node);
    await writeRemoteIndex(octokit, context.login, index, remote?.sha);
    return NextResponse.json({ folder });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create folder" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const context = await getRequestContext();
  if ("error" in context) return context.error;

  const { searchParams } = new URL(req.url);
  const parsed = DeleteFolderSchema.safeParse({ path: searchParams.get("path") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid path" }, { status: 400 });
  }

  try {
    const octokit = createOctokit(context.accessToken);
    const remote = await readRemoteIndex(octokit, context.login);
    const index = remote?.content ?? emptyIndex();
    deleteFolder(index, parsed.data.path);
    await writeRemoteIndex(octokit, context.login, index, remote?.sha);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete folder" },
      { status: 500 }
    );
  }
}