"use server";

import { auth } from "@/auth";
import {
  addFileToFolder,
  addFileToIndex,
  createFolder,
  deleteFolder,
  emptyIndex,
  renameFolder,
  removeFileFromFolder,
  removeFileFromIndex,
} from "@/lib/index";
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
  name: string,
  parentPath: string,
  node: string
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const cleanName = name.trim();
  if (!cleanName) return index;
  const fullPath = parentPath === "/" || !parentPath
    ? cleanName
    : `${parentPath}/${cleanName}`;
  createFolder(index, fullPath, node);

  return persistIndex(octokit, login, index, masterSha);
}

export async function deleteFolderAction(path: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  deleteFolder(index, path);

  return persistIndex(octokit, login, index, masterSha);
}

export async function renameFolderAction(fromPath: string, toPath: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  renameFolder(index, fromPath, toPath);

  return persistIndex(octokit, login, index, masterSha);
}

export async function addToFolderAction(hashes: string[], folderPath: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    addFileToFolder(index, hash, folderPath);
  }

  return persistIndex(octokit, login, index, masterSha);
}

export async function removeFromFolderAction(hashes: string[], folderPath: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    removeFileFromFolder(index, hash, folderPath);
  }

  return persistIndex(octokit, login, index, masterSha);
}

export async function moveToFolderAction(
  hashes: string[],
  fromFolder: string,
  toFolder: string
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    removeFileFromFolder(index, hash, fromFolder);
    addFileToFolder(index, hash, toFolder);
  }

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

export async function setStarredAction(hashes: string[], starred: boolean): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    const current = index.files[hash];
    if (!current) continue;
    index.files[hash] = { ...current, starred };
  }

  return persistIndex(octokit, login, index, masterSha);
}

export async function moveFilesToTrashAction(hashes: string[]): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const trashedAt = new Date().toISOString();
  for (const hash of hashes) {
    const current = index.files[hash];
    if (!current) continue;
    index.files[hash] = { ...current, trashed: true, trashedAt };
  }

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
  patch: {
    thumbnail?: string;
    folders?: string[];
    starred?: boolean;
    trashed?: boolean;
    trashedAt?: string;
    repo?: string;
  }
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const current = index.files[hash];
  if (!current) return index;

  index.files[hash] = {
    ...current,
    ...patch,
    folders: patch.folders ?? current.folders ?? [],
  };
  return persistIndex(octokit, login, index, masterSha);
}
