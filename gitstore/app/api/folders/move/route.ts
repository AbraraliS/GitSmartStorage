import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { assertOwner, createOctokit, readRemoteIndex, writeRemoteIndex } from "@/lib/github";
import { addFileToFolder, emptyIndex, removeFileFromFolder } from "@/lib/index";
import { checkRateLimit } from "@/lib/ratelimit";

const AddToFolderSchema = z.object({
  hashes: z.array(z.string().min(1).max(64)).min(1).max(500),
  targetFolder: z.string().min(1).max(500),
});

const RemoveFromFolderSchema = z.object({
  hashes: z.array(z.string().min(1).max(64)).min(1).max(500),
  folderPath: z.string().min(1).max(500),
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

  let body: z.infer<typeof AddToFolderSchema>;
  try {
    body = AddToFolderSchema.parse(await req.json());
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

    for (const hash of body.hashes) {
      addFileToFolder(index, hash, body.targetFolder);
    }

    await writeRemoteIndex(octokit, context.login, index, remote?.sha);
    return NextResponse.json({ files: body.hashes.map((hash) => index.files[hash]).filter(Boolean) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add files to folder" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const context = await getRequestContext();
  if ("error" in context) return context.error;

  let body: z.infer<typeof RemoveFromFolderSchema>;
  try {
    body = RemoveFromFolderSchema.parse(await req.json());
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

    for (const hash of body.hashes) {
      removeFileFromFolder(index, hash, body.folderPath);
    }

    await writeRemoteIndex(octokit, context.login, index, remote?.sha);
    return NextResponse.json({ files: body.hashes.map((hash) => index.files[hash]).filter(Boolean) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove files from folder" },
      { status: 500 }
    );
  }
}