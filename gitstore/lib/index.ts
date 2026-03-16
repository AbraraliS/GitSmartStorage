/**
 * lib/index.ts
 * index.json read / write / search / tokenize logic.
 * All mutations MUST go through this module so the search_index stays consistent.
 */

import type {
  GitStoreIndex,
  FileRecord,
  DataNode,
  FilterOptions,
  FolderMeta,
} from "@/types";

type LegacyFileRecord = FileRecord & { folder?: string };

// ─── Empty index factory ──────────────────────────────────────────────────

export function emptyIndex(): GitStoreIndex {
  return {
    nodes: {},
    files: {},
    search_index: {},
    folders: {},
    repoShards: {},
    updated_at: new Date().toISOString(),
    version: 2,
  };
}

function ensureIndexCollections(index: GitStoreIndex): void {
  if (!index.folders) index.folders = {};
  if (!index.repoShards) index.repoShards = {};
}

function normalizeFolderValue(folderPath: string): string {
  const trimmed = folderPath.trim().replace(/\\+/g, "/").replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed === ".") {
    throw new Error("Folder path cannot be empty");
  }
  if (trimmed.includes("..")) {
    throw new Error("Folder path cannot contain '..'");
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Folder path cannot be empty");
  }
  return segments.join("/");
}

function getRecordFolders(record: FileRecord): string[] {
  const folders = Array.isArray(record.folders) ? record.folders : [];
  if (folders.length > 0) {
    return Array.from(new Set(folders.map((entry) => entry.trim()).filter(Boolean)));
  }

  const legacyFolder = (record as LegacyFileRecord).folder;
  if (legacyFolder && legacyFolder !== "/") {
    return [legacyFolder];
  }

  return [];
}

function isImageFile(record: FileRecord): boolean {
  return record.type.startsWith("image/");
}

function sortFilesNewestFirst(files: FileRecord[]): FileRecord[] {
  return files.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );
}

function sortFilesOldestFirst(files: FileRecord[]): FileRecord[] {
  return files.sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );
}

function findFolderCover(index: GitStoreIndex, folderPath: string): string | undefined {
  return sortFilesOldestFirst(
    Object.values(index.files).filter(
      (record) => !record.trashed && isImageFile(record) && getRecordFolders(record).includes(folderPath)
    )
  )[0]?.hash;
}

function syncFolderCover(index: GitStoreIndex, folderPath: string): void {
  ensureIndexCollections(index);
  const folder = index.folders?.[folderPath];
  if (!folder) return;

  const coverId = findFolderCover(index, folderPath);
  if (coverId) {
    folder.coverId = coverId;
  } else {
    delete folder.coverId;
  }
}

function normalizeRecordForIndex(index: GitStoreIndex, record: FileRecord): FileRecord {
  const folders = getRecordFolders(record);
  return {
    ...record,
    folders,
    repo: record.repo ?? index.nodes[record.node]?.repo,
  };
}

export function normalizeIndex(index: GitStoreIndex): GitStoreIndex {
  ensureIndexCollections(index);

  for (const node of Object.values(index.nodes)) {
    if (!index.repoShards![node.id] || index.repoShards![node.id].length === 0) {
      index.repoShards![node.id] = [
        {
          nodeId: node.id,
          repo: node.repo,
          size_mb: node.size_mb,
          created: node.created ?? new Date().toISOString(),
          isCurrent: true,
        },
      ];
    }
  }

  for (const [hash, record] of Object.entries(index.files)) {
    index.files[hash] = normalizeRecordForIndex(index, record);
  }

  return index;
}

// ─── Search index helpers ─────────────────────────────────────────────────

/**
 * Tokenise a filename and array of tags into lowercase words.
 * Strips extension from filename.
 */
export function tokenise(filename: string, tags: string[]): string[] {
  const words = new Set<string>();

  // Split filename on non-word characters, ignore extension
  const base = filename.replace(/\.[^.]+$/, "");
  for (const tok of base.split(/[\W_]+/)) {
    if (tok.length > 1) words.add(tok.toLowerCase());
  }

  for (const tag of tags) {
    for (const tok of tag.split(/[\W_]+/)) {
      if (tok.length > 0) words.add(tok.toLowerCase());
    }
  }

  return Array.from(words);
}

/**
 * Add a FileRecord to the index (files map + search_index).
 * Mutates the passed index object — caller is responsible for persisting.
 */
export function addFileToIndex(index: GitStoreIndex, record: FileRecord): void {
  ensureIndexCollections(index);
  const nextRecord = normalizeRecordForIndex(index, record);
  index.files[nextRecord.hash] = nextRecord;

  for (const token of tokenise(nextRecord.name, nextRecord.tags)) {
    if (!index.search_index[token]) {
      index.search_index[token] = [];
    }
    if (!index.search_index[token].includes(nextRecord.hash)) {
      index.search_index[token].push(nextRecord.hash);
    }
  }

  for (const folderPath of nextRecord.folders ?? []) {
    if (index.folders?.[folderPath] && isImageFile(nextRecord) && !index.folders[folderPath].coverId) {
      index.folders[folderPath].coverId = nextRecord.hash;
    }
  }
}

export function getFilesInFolder(index: GitStoreIndex, folderPath: string): FileRecord[] {
  if (folderPath === "/" || !folderPath) {
    return sortFilesNewestFirst(
      Object.values(index.files).filter(
        (file) => !file.trashed && (!file.folders || file.folders.length === 0)
      )
    );
  }

  return sortFilesNewestFirst(
    Object.values(index.files).filter(
      (file) => !file.trashed && (file.folders ?? []).includes(folderPath)
    )
  );
}

/**
 * Remove a FileRecord from the index (files map + search_index).
 */
export function removeFileFromIndex(
  index: GitStoreIndex,
  hash: string
): void {
  ensureIndexCollections(index);
  const record = index.files[hash];
  if (!record) return;

  const folderPaths = getRecordFolders(record);

  delete index.files[hash];

  for (const token of tokenise(record.name, record.tags)) {
    const list = index.search_index[token];
    if (list) {
      const next = list.filter((h) => h !== hash);
      if (next.length === 0) {
        delete index.search_index[token];
      } else {
        index.search_index[token] = next;
      }
    }
  }

  for (const folderPath of folderPaths) {
    syncFolderCover(index, folderPath);
  }
}

/**
 * Add or update a DataNode in the index.
 */
export function addNodeToIndex(index: GitStoreIndex, node: DataNode): void {
  ensureIndexCollections(index);
  index.nodes[node.id] = node;
  const existing = index.repoShards?.[node.id] ?? [];
  if (existing.length === 0) {
    index.repoShards![node.id] = [
      {
        nodeId: node.id,
        repo: node.repo,
        size_mb: node.size_mb,
        created: node.created ?? new Date().toISOString(),
        isCurrent: true,
      },
    ];
  }
}

/**
 * Update the cumulative size of a node after upload.
 */
export function incrementNodeSize(
  index: GitStoreIndex,
  nodeId: string,
  bytes: number
): void {
  if (index.nodes[nodeId]) {
    index.nodes[nodeId].size_mb += bytes / (1024 * 1024);
  }
}

export function incrementShardSize(
  index: GitStoreIndex,
  nodeId: string,
  repo: string,
  bytes: number
): void {
  ensureIndexCollections(index);
  const sizeMb = bytes / (1024 * 1024);
  const shards = index.repoShards?.[nodeId] ?? [];
  const shard = shards.find((entry) => entry.repo === repo);

  if (shard) {
    shard.size_mb += sizeMb;
    return;
  }

  shards.push({
    nodeId,
    repo,
    size_mb: sizeMb,
    created: new Date().toISOString(),
    isCurrent: false,
  });
  index.repoShards![nodeId] = shards;
}

export function addFileToFolder(index: GitStoreIndex, fileHash: string, folderPath: string): void {
  ensureIndexCollections(index);
  const record = index.files[fileHash];
  if (!record) return;

  const normalizedPath = normalizeFolderValue(folderPath);
  if (!index.folders?.[normalizedPath]) {
    throw new Error(`Folder \"${normalizedPath}\" does not exist`);
  }

  const folders = new Set(getRecordFolders(record));
  folders.add(normalizedPath);
  record.folders = Array.from(folders);

  if (isImageFile(record) && !index.folders[normalizedPath].coverId) {
    index.folders[normalizedPath].coverId = fileHash;
  }
}

export function removeFileFromFolder(index: GitStoreIndex, fileHash: string, folderPath: string): void {
  ensureIndexCollections(index);
  const record = index.files[fileHash];
  if (!record) return;

  const normalizedPath = normalizeFolderValue(folderPath);
  const currentFolders = getRecordFolders(record);
  record.folders = currentFolders.filter((entry) => entry !== normalizedPath);
  syncFolderCover(index, normalizedPath);
}

export function createFolder(index: GitStoreIndex, path: string, node: string): FolderMeta {
  ensureIndexCollections(index);
  const normalizedPath = normalizeFolderValue(path);
  const parts = normalizedPath.split("/");
  let parent = "/";
  let currentPath = "";
  let createdFolder: FolderMeta | undefined;

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (!index.folders?.[currentPath]) {
      index.folders![currentPath] = {
        id: currentPath,
        name: part,
        path: currentPath,
        parent,
        node,
        created: new Date().toISOString(),
      };
    }
    createdFolder = index.folders![currentPath];
    parent = currentPath;
  }

  return createdFolder!;
}

export function deleteFolder(index: GitStoreIndex, path: string): void {
  ensureIndexCollections(index);
  const normalizedPath = normalizeFolderValue(path);
  const folderPaths = Object.keys(index.folders ?? {}).filter(
    (entry) => entry === normalizedPath || entry.startsWith(`${normalizedPath}/`)
  );

  for (const record of Object.values(index.files)) {
    const nextFolders = getRecordFolders(record).filter(
      (entry) => !folderPaths.includes(entry)
    );
    if (nextFolders.length !== getRecordFolders(record).length) {
      record.folders = nextFolders;
    }
  }

  for (const folderPath of folderPaths) {
    delete index.folders?.[folderPath];
  }
}

export function renameFolder(index: GitStoreIndex, fromPath: string, toPath: string): FolderMeta {
  ensureIndexCollections(index);
  const sourcePath = normalizeFolderValue(fromPath);
  const targetPath = normalizeFolderValue(toPath);
  if (sourcePath === targetPath) {
    return index.folders?.[sourcePath] as FolderMeta;
  }
  if (targetPath.startsWith(`${sourcePath}/`)) {
    throw new Error("Folder cannot be moved into its own child path");
  }

  const sourceFolder = index.folders?.[sourcePath];
  if (!sourceFolder) {
    throw new Error(`Folder \"${sourcePath}\" does not exist`);
  }
  if (index.folders?.[targetPath]) {
    throw new Error(`Folder \"${targetPath}\" already exists`);
  }

  const targetParent = targetPath.includes("/") ? targetPath.split("/").slice(0, -1).join("/") : "";
  if (targetParent) {
    createFolder(index, targetParent, sourceFolder.node ?? "documents");
  }

  const affectedFolders = Object.values(index.folders ?? {})
    .filter((folder) => folder.path === sourcePath || folder.path.startsWith(`${sourcePath}/`))
    .sort((a, b) => a.path.length - b.path.length);

  for (const folder of affectedFolders) {
    delete index.folders?.[folder.path];
  }

  for (const folder of affectedFolders) {
    const suffix = folder.path === sourcePath ? "" : folder.path.slice(sourcePath.length + 1);
    const nextPath = suffix ? `${targetPath}/${suffix}` : targetPath;
    const lastSlash = nextPath.lastIndexOf("/");
    const parent = lastSlash >= 0 ? nextPath.slice(0, lastSlash) : "/";
    const name = lastSlash >= 0 ? nextPath.slice(lastSlash + 1) : nextPath;
    index.folders![nextPath] = {
      ...folder,
      id: nextPath,
      path: nextPath,
      parent,
      name,
    };
  }

  for (const record of Object.values(index.files)) {
    const nextFolders = getRecordFolders(record).map((folderPath) => {
      if (folderPath === sourcePath) return targetPath;
      if (folderPath.startsWith(`${sourcePath}/`)) {
        return `${targetPath}/${folderPath.slice(sourcePath.length + 1)}`;
      }
      return folderPath;
    });
    record.folders = Array.from(new Set(nextFolders));
  }

  return index.folders![targetPath];
}

export function getFolderContents(index: GitStoreIndex, folderPath: string): FileRecord[] {
  if (folderPath === "/" || !folderPath) {
    return getFilesInFolder(index, "/");
  }
  const normalizedPath = normalizeFolderValue(folderPath);
  return getFilesInFolder(index, normalizedPath);
}

export function getSubFoldersOf(index: GitStoreIndex, parentPath: string): FolderMeta[] {
  ensureIndexCollections(index);
  return Object.values(index.folders ?? {})
    .filter((folder) => folder.parent === parentPath)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Delete a folder and all descendants. Files are preserved and only lose
 * pointers to deleted folders.
 */
export function deleteFolderFromIndex(index: GitStoreIndex, folderPath: string): void {
  ensureIndexCollections(index);
  if (!index.folders?.[folderPath]) return;

  const toDelete = new Set<string>([folderPath]);
  const collectDescendants = (path: string) => {
    Object.values(index.folders ?? {}).forEach((folder) => {
      if (folder.parent === path) {
        toDelete.add(folder.path);
        collectDescendants(folder.path);
      }
    });
  };
  collectDescendants(folderPath);

  Object.values(index.files).forEach((file) => {
    if (file.folders?.some((fp) => toDelete.has(fp))) {
      file.folders = (file.folders ?? []).filter((fp) => !toDelete.has(fp));
    }
  });

  toDelete.forEach((path) => {
    delete index.folders?.[path];
  });
}

/**
 * Rename a folder's leaf segment and remap descendant folder and file pointers.
 */
export function renameFolderInIndex(
  index: GitStoreIndex,
  oldPath: string,
  newName: string
): string {
  ensureIndexCollections(index);
  const folder = index.folders?.[oldPath];
  if (!folder) return oldPath;

  const cleanName = newName.trim().replace(/[/\\]/g, "");
  if (!cleanName || cleanName === folder.name) return oldPath;

  const parentPrefix = folder.parent === "/" ? "" : `${folder.parent}/`;
  const newPath = `${parentPrefix}${cleanName}`;
  if (index.folders?.[newPath]) return oldPath;

  const pathRemap = new Map<string, string>();
  pathRemap.set(oldPath, newPath);

  const collectDescendants = (oldParentPath: string, newParentPath: string) => {
    Object.values(index.folders ?? {}).forEach((entry) => {
      if (entry.parent === oldParentPath) {
        const childNewPath = `${newParentPath}/${entry.name}`;
        pathRemap.set(entry.path, childNewPath);
        collectDescendants(entry.path, childNewPath);
      }
    });
  };
  collectDescendants(oldPath, newPath);

  const newFolders: Record<string, FolderMeta> = {};
  Object.values(index.folders ?? {}).forEach((entry) => {
    if (pathRemap.has(entry.path)) {
      const remappedPath = pathRemap.get(entry.path)!;
      const remappedParent = pathRemap.get(entry.parent) ?? entry.parent;
      newFolders[remappedPath] = {
        ...entry,
        id: remappedPath,
        path: remappedPath,
        parent: remappedParent,
        name: remappedPath === newPath ? cleanName : entry.name,
      };
    } else {
      newFolders[entry.path] = entry;
    }
  });
  index.folders = newFolders;

  Object.values(index.files).forEach((file) => {
    if (file.folders?.some((fp) => pathRemap.has(fp))) {
      file.folders = (file.folders ?? []).map((fp) => pathRemap.get(fp) ?? fp);
    }
  });

  return newPath;
}

/**
 * Move a folder to a new parent path and remap descendant folder and file pointers.
 */
export function moveFolderInIndex(
  index: GitStoreIndex,
  folderPath: string,
  newParentPath: string
): string {
  ensureIndexCollections(index);
  const folder = index.folders?.[folderPath];
  if (!folder) return folderPath;

  const normalizedParent = newParentPath === "/" || !newParentPath
    ? "/"
    : normalizeFolderValue(newParentPath);

  if (normalizedParent === folderPath || normalizedParent.startsWith(`${folderPath}/`)) {
    return folderPath;
  }

  const newBase = normalizedParent === "/"
    ? folder.name
    : `${normalizedParent}/${folder.name}`;

  if (newBase === folderPath || index.folders?.[newBase]) {
    return folderPath;
  }

  const pathRemap = new Map<string, string>();
  pathRemap.set(folderPath, newBase);

  const collectSubtree = (oldParentPath: string) => {
    Object.values(index.folders ?? {}).forEach((entry) => {
      if (entry.parent === oldParentPath) {
        pathRemap.set(entry.path, `${newBase}${entry.path.slice(folderPath.length)}`);
        collectSubtree(entry.path);
      }
    });
  };
  collectSubtree(folderPath);

  const newFolders: Record<string, FolderMeta> = {};
  Object.values(index.folders ?? {}).forEach((entry) => {
    if (pathRemap.has(entry.path)) {
      const remappedPath = pathRemap.get(entry.path)!;
      const remappedParent = entry.path === folderPath
        ? normalizedParent
        : pathRemap.get(entry.parent) ?? entry.parent;
      newFolders[remappedPath] = {
        ...entry,
        id: remappedPath,
        path: remappedPath,
        parent: remappedParent,
      };
    } else {
      newFolders[entry.path] = entry;
    }
  });
  index.folders = newFolders;

  Object.values(index.files).forEach((file) => {
    if (file.folders?.some((fp) => pathRemap.has(fp))) {
      file.folders = (file.folders ?? []).map((fp) => pathRemap.get(fp) ?? fp);
    }
  });

  return newBase;
}

export function toggleFolderStar(index: GitStoreIndex, folderPath: string): void {
  const folder = index.folders?.[folderPath];
  if (!folder) return;
  folder.starred = !folder.starred;
}

/**
 * Count all files inside a folder recursively (self + descendant folders).
 * Used by folder badges and folder cards.
 */
export function getFolderStats(
  index: GitStoreIndex,
  folderPath: string
): { fileCount: number; totalSize: number } {
  const allFolderPaths = new Set<string>([folderPath]);

  const collectDescendants = (path: string) => {
    Object.values(index.folders ?? {}).forEach((folder) => {
      if (folder.parent === path) {
        allFolderPaths.add(folder.path);
        collectDescendants(folder.path);
      }
    });
  };

  collectDescendants(folderPath);

  let fileCount = 0;
  let totalSize = 0;

  Object.values(index.files).forEach((file) => {
    if (file.trashed) return;
    const fileFolders = file.folders ?? [];
    if (fileFolders.some((fp) => allFolderPaths.has(fp))) {
      fileCount += 1;
      totalSize += file.size;
    }
  });

  return { fileCount, totalSize };
}

/**
 * Count direct children of a folder (direct files + direct subfolders).
 */
export function getFolderDirectCount(index: GitStoreIndex, folderPath: string): number {
  const directFiles = Object.values(index.files).filter(
    (file) => !file.trashed && (file.folders ?? []).includes(folderPath)
  ).length;

  const directSubfolders = Object.values(index.folders ?? {}).filter(
    (folder) => folder.parent === folderPath
  ).length;

  return directFiles + directSubfolders;
}

export function getNodeFiles(index: GitStoreIndex, nodeId: string): FileRecord[] {
  return sortFilesNewestFirst(
    Object.values(index.files).filter((record) => !record.trashed && record.node === nodeId)
  );
}

export function getSmartFolderFiles(
  index: GitStoreIndex,
  type: "month" | "tag" | "node" | "starred",
  value?: string
): FileRecord[] {
  let files = Object.values(index.files).filter((record) => !record.trashed);

  switch (type) {
    case "month":
      files = files.filter((record) => Boolean(value) && record.created.startsWith(value!));
      break;
    case "tag":
      files = files.filter((record) => Boolean(value) && record.tags.includes(value!));
      break;
    case "node":
      files = files.filter((record) => Boolean(value) && record.node === value);
      break;
    case "starred":
      files = files.filter((record) => record.starred === true);
      break;
  }

  return sortFilesNewestFirst(files);
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Full-text keyword search against the in-memory search_index — O(1) per word.
 * Returns matching FileRecords, optionally filtered.
 */
export function searchFiles(
  index: GitStoreIndex,
  query: string,
  filters?: FilterOptions
): FileRecord[] {
  let hashes: Set<string> | null = null;

  if (query.trim()) {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    for (const token of tokens) {
      const matches = index.search_index[token] ?? [];
      const matchSet = new Set(matches);
      if (hashes === null) {
        hashes = matchSet;
      } else {
        // AND semantics: keep only hashes that appear in ALL token results
        for (const h of Array.from(hashes)) {
          if (!matchSet.has(h)) hashes.delete(h);
        }
      }
    }

    if (hashes === null) hashes = new Set();
  } else {
    // No query — return all files (subject to filters)
    hashes = new Set(Object.keys(index.files));
  }

  let results = Array.from(hashes)
    .map((h) => index.files[h])
    .filter(Boolean);

  // Apply optional filters
  if (filters) {
    if (filters.node) {
      results = results.filter((f) => f.node === filters.node);
    }
    if (filters.type) {
      results = results.filter((f) => f.type.startsWith(filters.type!));
    }
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter((f) =>
        filters.tags!.every((tag) => f.tags.includes(tag))
      );
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      results = results.filter(
        (f) => new Date(f.created).getTime() >= from
      );
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      results = results.filter(
        (f) => new Date(f.created).getTime() <= to
      );
    }
    if (filters.minSize !== undefined) {
      results = results.filter((f) => f.size >= filters.minSize!);
    }
    if (filters.maxSize !== undefined) {
      results = results.filter((f) => f.size <= filters.maxSize!);
    }
  }

  // Sort newest first
  return results.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );
}

// ─── Serialisation helpers (for API routes) ──────────────────────────────

export function serializeIndex(index: GitStoreIndex): string {
  return JSON.stringify(
    { ...index, updated_at: new Date().toISOString() },
    null,
    2
  );
}

export function deserializeIndex(raw: string): GitStoreIndex {
  return normalizeIndex(JSON.parse(raw) as GitStoreIndex);
}

export function getTrashedFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter((f) => f.trashed);
}

export function getStarredFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter((f) => f.starred && !f.trashed);
}
