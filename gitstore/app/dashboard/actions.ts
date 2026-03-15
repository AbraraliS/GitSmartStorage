"use server";

import { auth } from "@/auth";
import { addFileToIndex, emptyIndex, removeFileFromIndex } from "@/lib/index";
import { createOctokit, readRemoteIndex, writeRemoteIndex } from "@/lib/github";
import type { GitStoreIndex } from "@/types";

async function getContext(): Promise<{
  octokit: ReturnType<typeof createOctokit>;
  login: string;
  index: GitStoreIndex;
  masterSha?: string;
}> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const accessToken = (session as unknown as Record<string, string>).accessToken;
  const login = (session as unknown as Record<string, string>).login;

  if (!accessToken || !login) throw new Error("Missing credentials");

  const octokit = createOctokit(accessToken);
  const remote = await readRemoteIndex(octokit, login);

  return {
    octokit,
    login,
    index: remote?.content ?? emptyIndex(),
    masterSha: remote?.sha,
  };
}

async function persistIndex(
  octokit: ReturnType<typeof createOctokit>,
  login: string,
  index: GitStoreIndex,
  masterSha?: string
): Promise<GitStoreIndex> {
  await writeRemoteIndex(octokit, login, index, masterSha);
  return index;
}

export async function createFolderAction(
  node: string,
  parent: string,
  name: string
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const cleanName = name.trim();
  if (!cleanName) return index;

  if (!index.folders) index.folders = {};
  const base = parent === "/" ? "" : `${parent}/`;
  const id = `${node}:${base}${cleanName}`;
  index.folders[id] = {
    name: cleanName,
    node,
    parent,
    created: new Date().toISOString(),
  };

  return persistIndex(octokit, login, index, masterSha);
}

export async function renameFileAction(hash: string, nextName: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) throw new Error("File not found");

  removeFileFromIndex(index, hash);
  addFileToIndex(index, { ...current, name: nextName.trim() || current.name });

  return persistIndex(octokit, login, index, masterSha);
}

export async function moveFileAction(hash: string, folder: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) throw new Error("File not found");

  index.files[hash] = { ...current, folder: folder || "/" };
  return persistIndex(octokit, login, index, masterSha);
}

export async function toggleStarAction(hash: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) throw new Error("File not found");

  index.files[hash] = { ...current, starred: !current.starred };
  return persistIndex(octokit, login, index, masterSha);
}

export async function moveToTrashAction(hash: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) throw new Error("File not found");

  index.files[hash] = {
    ...current,
    trashed: true,
    trashedAt: new Date().toISOString(),
  };
  return persistIndex(octokit, login, index, masterSha);
}

export async function emptyTrashAction(): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const record of Object.values(index.files)) {
    if (record.trashed) removeFileFromIndex(index, record.hash);
  }
  return persistIndex(octokit, login, index, masterSha);
}

export async function enrichUploadedFileAction(
  hash: string,
  patch: Pick<
    NonNullable<GitStoreIndex["files"][string]>,
    "thumbnail" | "folder" | "starred" | "trashed" | "trashedAt"
  >
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) return index;

  index.files[hash] = { ...current, ...patch };
  return persistIndex(octokit, login, index, masterSha);
}
