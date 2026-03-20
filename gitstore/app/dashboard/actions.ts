"use server";

import { auth } from "@/auth";
import {
  addFileToFolder,
  addFileToIndex,
  createFolder,
  deleteFolderFromIndex,
  emptyIndex,
  moveFolderInIndex,
  renameFolderInIndex,
  removeFileFromFolder,
  removeFileFromIndex,
  toggleFolderStar,
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
  deleteFolderFromIndex(index, path);

  return persistIndex(octokit, login, index, masterSha);
}

export async function renameFolderAction(
  fromPath: string,
  newName: string
): Promise<{ index: GitStoreIndex; newPath: string }> {
  const { octokit, login, index, masterSha } = await getContext();
  const newPath = renameFolderInIndex(index, fromPath, newName);
  const updatedIndex = await persistIndex(octokit, login, index, masterSha);
  return { index: updatedIndex, newPath };
}

export async function moveFolderAction(
  folderPath: string,
  newParentPath: string
): Promise<{ index: GitStoreIndex; newPath: string }> {
  const { octokit, login, index, masterSha } = await getContext();
  const newPath = moveFolderInIndex(index, folderPath, newParentPath);
  const updatedIndex = await persistIndex(octokit, login, index, masterSha);
  return { index: updatedIndex, newPath };
}

export async function toggleFolderStarAction(folderPath: string): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  toggleFolderStar(index, folderPath);
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
    thumbnail: patch.thumbnail ?? current.thumbnail,
    folders: patch.folders ?? current.folders ?? [],
    starred: patch.starred ?? current.starred ?? false,
    trashed: patch.trashed ?? current.trashed ?? false,
    trashedAt: patch.trashedAt ?? current.trashedAt,
    repo: patch.repo ?? current.repo,
  };
  return persistIndex(octokit, login, index, masterSha);
}

/**
 * Trash multiple files at once — single index write.
 */
export async function bulkTrashAction(
  hashes: string[]
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  const now = new Date().toISOString();
  for (const hash of hashes) {
    const record = index.files[hash];
    if (!record) continue;
    index.files[hash] = { ...record, trashed: true, trashedAt: now };
  }
  return persistIndex(octokit, login, index, masterSha);
}

/**
 * Permanently delete multiple files — deletes blobs from GitHub AND removes from index.
 * Single index write after all GitHub deletes.
 */
export async function bulkDeleteAction(
  hashes: string[]
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();

  // Delete each file's chunks from GitHub in parallel, batched at 6
  const BATCH = 6;
  const allChunkPaths: Array<{ repo: string; path: string; sha: string }> = [];

  for (const hash of hashes) {
    const record = index.files[hash];
    if (!record) continue;
    const nodeInfo = index.nodes[record.node];
    if (!nodeInfo) continue;
    const paths = record.chunks?.length ? record.chunks : [record.path];
    for (const path of paths) {
      try {
        const { data } = await octokit.repos.getContent({
          owner: login, repo: nodeInfo.repo, path,
        });
        if (!Array.isArray(data) && data.type === "file") {
          allChunkPaths.push({ repo: nodeInfo.repo, path, sha: data.sha });
        }
      } catch {
        // File already gone — ignore
      }
    }
  }

  // Delete in batches of 6
  for (let i = 0; i < allChunkPaths.length; i += BATCH) {
    const batch = allChunkPaths.slice(i, i + BATCH);
    await Promise.all(
      batch.map(({ repo, path, sha }) =>
        octokit.repos.deleteFile({
          owner: login, repo, path, sha,
          message: `gitstore: delete ${path}`,
          branch: "main",
        }).catch(() => { /* ignore — already deleted */ })
      )
    );
  }

  // Remove from index — also remove folder pointers
  for (const hash of hashes) {
    delete index.files[hash];
    // Remove from search index
    for (const token of Object.keys(index.search_index ?? {})) {
      index.search_index[token] = (index.search_index[token] ?? []).filter(
        (h) => h !== hash
      );
    }
  }

  return persistIndex(octokit, login, index, masterSha);
}

/**
 * Restore multiple trashed files — single index write.
 */
export async function bulkRestoreAction(
  hashes: string[]
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    const record = index.files[hash];
    if (!record) continue;
    index.files[hash] = {
      ...record,
      trashed: false,
      trashedAt: undefined,
    };
  }
  return persistIndex(octokit, login, index, masterSha);
}

/**
 * Move multiple files to a folder — single index write.
 * Adds the folder path to each file's folders array (copy-pointer, non-destructive).
 */
export async function bulkMoveToFolderAction(
  hashes: string[],
  folderPath: string
): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  for (const hash of hashes) {
    addFileToFolder(index, hash, folderPath);
  }
  return persistIndex(octokit, login, index, masterSha);
}

export async function bulkStarAction(hashes: string[]): Promise<GitStoreIndex> {
  const { octokit, login, index, masterSha } = await getContext();
  // If any are unstarred, star all. If all starred, unstar all.
  const allStarred = hashes.every((h) => index.files[h]?.starred);
  for (const hash of hashes) {
    const record = index.files[hash];
    if (!record) continue;
    index.files[hash] = { ...record, starred: !allStarred };
  }
  return persistIndex(octokit, login, index, masterSha);
}

export async function purgeExpiredTrashAction(): Promise<GitStoreIndex | null> {
  const { octokit, login, index, masterSha } = await getContext();
  const expiredHashes = Object.values(index.files)
    .filter((f) => {
      if (!f.trashed || !f.trashedAt) return false;
      const daysAgo = (Date.now() - new Date(f.trashedAt).getTime()) / 86400000;
      return daysAgo >= 30;
    })
    .map((f) => f.hash);

  if (expiredHashes.length === 0) return null;

  // Reuse bulkDeleteAction logic inline — delete files + update index
  for (const hash of expiredHashes) {
    delete index.files[hash];
  }
  return persistIndex(octokit, login, index, masterSha);
}

