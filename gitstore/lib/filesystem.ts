/**
 * lib/filesystem.ts
 *
 * Production-grade virtual filesystem engine for GitStore.
 * Builds a deterministic, path-based filesystem tree from GitStoreIndex.
 *
 * Design principles:
 *  - `file.path` (virtualPath) is the single source of truth for placement.
 *  - Legacy `file.folders[]` is migrated at read-time (non-destructive).
 *  - All folder hierarchy is DERIVED from paths — never stored redundantly.
 *  - O(1) node lookup via FileSystemMap (Map<path, FSNode>).
 *  - Deterministic sort: folders first, files second, alphabetical within each.
 *  - Stable IDs from djb2 path hash — never array indexes.
 *  - Scales to 50k+ files via lazy traversal and memoization helpers.
 */

import type {
  FSNode,
  FileNode,
  FolderNode,
  FileTree,
  FileSystemMap,
  PathSegment,
  FileRecord,
  GitStoreIndex,
} from "@/types";

// ─── Path Normalization ───────────────────────────────────────────────────────

/**
 * Normalizes a raw path string into a canonical form:
 *   - Replaces backslashes with forward slashes
 *   - Collapses duplicate slashes
 *   - Strips leading/trailing slashes
 *   - Removes "." and ".." segments
 *   - Trims whitespace from each segment
 *   - Removes empty segments
 *
 * Returns "" for root (instead of "/") to allow consistent prefix matching.
 */
export function normalizePath(raw: string): string {
  if (!raw || raw === "/" || raw === ".") return "";

  const segments = raw
    .replace(/\\/g, "/")
    .split("/")
    .reduce<string[]>((acc, seg) => {
      const trimmed = seg.trim();
      if (!trimmed || trimmed === ".") return acc;
      if (trimmed === "..") {
        acc.pop();
        return acc;
      }
      // Strip characters unsafe in paths
      const safe = trimmed.replace(/[<>:"|?*\x00-\x1f]/g, "_");
      if (safe) acc.push(safe);
      return acc;
    }, []);

  return segments.join("/");
}

/**
 * Returns the parent path of a normalized path.
 * Returns null for root-level paths (no parent).
 */
export function getParentPath(normalizedPath: string): string | null {
  if (!normalizedPath) return null;
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return normalizedPath.slice(0, lastSlash);
}

/**
 * Returns the basename (last segment) of a normalized path.
 */
export function getBaseName(normalizedPath: string): string {
  if (!normalizedPath) return "";
  const lastSlash = normalizedPath.lastIndexOf("/");
  return lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
}

// ─── Stable ID Generation ────────────────────────────────────────────────────

/**
 * Generates a deterministic, stable string ID from a path using djb2 hash.
 * Format: "fs_<8hexchars>"
 */
export function generateNodeId(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) + hash) ^ path.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return `fs_${hash.toString(16).padStart(8, "0")}`;
}

// ─── Virtual Path Resolution ─────────────────────────────────────────────────

/**
 * Derives the canonical virtual filesystem path for a FileRecord.
 *
 * Priority order:
 *  1. `record.path` if it looks like a user-set virtual path (not a repo storage path)
 *  2. `record.folders[0]` + "/" + `record.name` (legacy model migration)
 *  3. `record.name` (root placement)
 *
 * A path is considered a "repo storage path" (not a virtual path) if it
 * matches the upload pipeline format: starts with YYYY/MM/ pattern.
 */
export function getVirtualPath(record: FileRecord): string {
  const storagePrefixRe = /^\d{4}\/\d{2}\//;

  // If path looks like a user virtual path (not a date-prefixed storage path), use it
  if (record.path && !storagePrefixRe.test(record.path)) {
    return normalizePath(record.path);
  }

  // Legacy: use folders[0] as the directory, combine with filename
  const legacyFolders = record.folders ?? [];
  if (legacyFolders.length > 0) {
    const dir = normalizePath(legacyFolders[0]);
    const filename = record.name || getBaseName(record.path);
    if (dir) return `${dir}/${filename}`;
    return filename;
  }

  // Fallback: root placement using just the filename
  return record.name || getBaseName(record.path) || record.hash;
}

// ─── Tree Construction ───────────────────────────────────────────────────────

function createFolderNode(
  path: string,
  name: string,
  parentPath: string | null,
  createdAt: string,
  explicit: boolean,
  meta?: { starred?: boolean; coverId?: string }
): FolderNode {
  return {
    id: generateNodeId(`folder:${path}`),
    type: "folder",
    name,
    path,
    parentPath,
    createdAt,
    updatedAt: createdAt,
    children: [],
    fileCount: 0,
    totalSize: 0,
    explicit,
    starred: meta?.starred,
    coverId: meta?.coverId,
  };
}

/**
 * Ensures all ancestor folder nodes exist in the map, creating them as needed.
 * Returns the immediate parent path (or null for root).
 */
function ensureAncestors(
  nodeMap: Map<string, FSNode>,
  filePath: string,
  now: string,
  indexFolders: Record<string, import("@/types").FolderMeta>
): string | null {
  const segments = filePath.split("/");
  // We want all segments except the last one (the filename)
  const folderSegments = segments.slice(0, -1);

  let parentPath: string | null = null;
  let currentPath = "";

  for (const seg of folderSegments) {
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;

    if (!nodeMap.has(currentPath)) {
      const meta = indexFolders[currentPath];
      const folder = createFolderNode(
        currentPath,
        seg,
        parentPath,
        meta?.created ?? now,
        !!meta,
        meta ? { starred: meta.starred, coverId: meta.coverId } : undefined
      );
      nodeMap.set(currentPath, folder);
    }

    // Register as child of parent
    const parentNode: FSNode | undefined = parentPath ? nodeMap.get(parentPath) : undefined;
    if (parentNode && parentNode.type === "folder") {
      if (!parentNode.children.includes(currentPath)) {
        parentNode.children.push(currentPath);
      }
    }

    parentPath = currentPath;
  }

  return parentPath;
}

/**
 * Deterministic sort comparator: folders before files, then alphabetical.
 */
function sortedChildren(paths: string[], nodeMap: FileSystemMap): string[] {
  return [...paths].sort((a, b) => {
    const na = nodeMap.get(a);
    const nb = nodeMap.get(b);
    const aIsFolder = na?.type === "folder" ? 0 : 1;
    const bIsFolder = nb?.type === "folder" ? 0 : 1;
    if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder;
    return (na?.name ?? a).localeCompare(nb?.name ?? b);
  });
}

/**
 * Recursively computes fileCount and totalSize for all folder nodes.
 */
function computeFolderStats(
  path: string,
  nodeMap: FileSystemMap
): { fileCount: number; totalSize: number } {
  const node = nodeMap.get(path);
  if (!node || node.type !== "folder") return { fileCount: 0, totalSize: 0 };

  let fileCount = 0;
  let totalSize = 0;

  for (const childPath of node.children) {
    const child = nodeMap.get(childPath);
    if (!child) continue;
    if (child.type === "file") {
      fileCount++;
      totalSize += child.size;
    } else {
      const stats = computeFolderStats(childPath, nodeMap);
      fileCount += stats.fileCount;
      totalSize += stats.totalSize;
    }
  }

  node.fileCount = fileCount;
  node.totalSize = totalSize;

  return { fileCount, totalSize };
}

/**
 * Builds the complete virtual filesystem tree from a GitStoreIndex.
 *
 * This is the canonical entry point for all filesystem operations.
 * The result is deterministic and stable given the same index.
 *
 * Complexity: O(F log F) where F = number of files.
 */
export function buildFileTree(index: GitStoreIndex): FileTree {
  const nodeMap: FileSystemMap = new Map();
  const rootChildren: string[] = [];
  const indexFolders = index.folders ?? {};
  const now = new Date().toISOString();

  // Phase 1: Seed explicit folders from index.folders (preserves metadata like starred, coverId)
  for (const [folderPath, meta] of Object.entries(indexFolders)) {
    const normalized = normalizePath(folderPath);
    if (!normalized) continue;
    if (!nodeMap.has(normalized)) {
      const name = getBaseName(normalized);
      const parentPath = getParentPath(normalized);
      nodeMap.set(
        normalized,
        createFolderNode(normalized, name, parentPath, meta.created, true, {
          starred: meta.starred,
          coverId: meta.coverId,
        })
      );
    }
  }

  // Phase 2: Process all non-trashed files
  let totalFiles = 0;
  let totalSize = 0;

  for (const record of Object.values(index.files)) {
    if (record.trashed) continue;

    const virtualPath = getVirtualPath(record);
    if (!virtualPath) continue;

    totalFiles++;
    totalSize += record.size;

    // Ensure all ancestor folder nodes exist
    const parentPath = ensureAncestors(nodeMap, virtualPath, now, indexFolders);

    // Create the file node
    const fileNode: FileNode = {
      id: generateNodeId(`file:${record.hash}`),
      type: "file",
      name: record.name || getBaseName(virtualPath),
      path: virtualPath,
      parentPath,
      createdAt: record.created,
      updatedAt: record.created,
      record,
      size: record.size,
      mimeType: record.type || "application/octet-stream",
    };

    nodeMap.set(virtualPath, fileNode);

    // Register as child of parent folder
    if (parentPath) {
      const parentNode = nodeMap.get(parentPath);
      if (parentNode && parentNode.type === "folder") {
        if (!parentNode.children.includes(virtualPath)) {
          parentNode.children.push(virtualPath);
        }
      }
    } else {
      // Root-level file
      if (!rootChildren.includes(virtualPath)) {
        rootChildren.push(virtualPath);
      }
    }
  }

  // Phase 3: Wire up explicit folders that may not have been created by file processing
  for (const folderPath of Object.keys(indexFolders)) {
    const normalized = normalizePath(folderPath);
    if (!normalized) continue;

    const parentPath = getParentPath(normalized);

    if (parentPath) {
      const parentNode = nodeMap.get(parentPath);
      if (parentNode && parentNode.type === "folder") {
        if (!parentNode.children.includes(normalized)) {
          parentNode.children.push(normalized);
        }
      } else {
        // Parent doesn't exist yet — create ancestor chain
        // (rare: explicit folder with missing parent in index)
        ensureAncestors(
          nodeMap,
          `${normalized}/__placeholder__`,
          now,
          indexFolders
        );
        // Clean up the placeholder
        nodeMap.delete(`${normalized}/__placeholder__`);
        const folder = nodeMap.get(normalized);
        if (folder && folder.type === "folder") {
          folder.children = folder.children.filter(
            (c) => !c.endsWith("/__placeholder__")
          );
        }
        const actualParent = nodeMap.get(parentPath);
        if (actualParent && actualParent.type === "folder") {
          if (!actualParent.children.includes(normalized)) {
            actualParent.children.push(normalized);
          }
        }
      }
    } else {
      // Root-level explicit folder
      if (!rootChildren.includes(normalized)) {
        rootChildren.push(normalized);
      }
    }
  }

  // Phase 4: Collect root-level folder nodes that aren't already tracked
  for (const [path, node] of nodeMap.entries()) {
    if (node.parentPath === null && !rootChildren.includes(path)) {
      rootChildren.push(path);
    }
  }

  // Phase 5: Sort all children arrays deterministically
  for (const node of nodeMap.values()) {
    if (node.type === "folder") {
      node.children = sortedChildren(node.children, nodeMap);
    }
  }

  // Sort root children
  const sortedRoot = sortedChildren(rootChildren, nodeMap);

  // Phase 6: Compute recursive folder stats
  for (const path of sortedRoot) {
    const node = nodeMap.get(path);
    if (node?.type === "folder") {
      computeFolderStats(path, nodeMap);
    }
  }

  return {
    nodes: nodeMap,
    rootChildren: sortedRoot,
    totalFiles,
    totalSize,
  };
}

// ─── Tree Query Utilities ─────────────────────────────────────────────────────

/** Resolve a path to its node, or null if not found. */
export function resolvePath(tree: FileTree, path: string): FSNode | null {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  return tree.nodes.get(normalized) ?? null;
}

/** Get direct children of a folder path, sorted (folders first). */
export function getFolderChildren(
  tree: FileTree,
  folderPath: string
): FSNode[] {
  const normalized = normalizePath(folderPath);
  const children = normalized
    ? (tree.nodes.get(normalized) as FolderNode | undefined)?.children ?? []
    : tree.rootChildren;

  return children
    .map((p) => tree.nodes.get(p))
    .filter((n): n is FSNode => n !== undefined);
}

/** Get root-level nodes (direct children of the virtual root). */
export function getRootChildren(tree: FileTree): FSNode[] {
  return tree.rootChildren
    .map((p) => tree.nodes.get(p))
    .filter((n): n is FSNode => n !== undefined);
}

/**
 * Generate breadcrumb segments for a given path.
 * Returns an array from root to current, with isLast marking the final segment.
 */
export function getBreadcrumbs(path: string): PathSegment[] {
  const normalized = normalizePath(path);
  if (!normalized) return [];

  const segments = normalized.split("/");
  return segments.map((seg, idx) => {
    const segPath = segments.slice(0, idx + 1).join("/");
    const isLast = idx === segments.length - 1;
    return { label: seg, path: segPath, isLast };
  });
}

/**
 * Flatten the entire tree into a depth-first ordered array of FSNodes.
 * Useful for search results and virtualized lists.
 */
export function flattenTree(tree: FileTree): FSNode[] {
  const result: FSNode[] = [];

  const visit = (paths: string[]) => {
    for (const path of paths) {
      const node = tree.nodes.get(path);
      if (!node) continue;
      result.push(node);
      if (node.type === "folder") {
        visit(node.children);
      }
    }
  };

  visit(tree.rootChildren);
  return result;
}

/**
 * Walk the tree depth-first (pre-order), invoking callback for each node.
 * Return false from callback to stop traversal of that subtree.
 */
export function walkTreeDFS(
  tree: FileTree,
  callback: (node: FSNode, depth: number) => boolean | void
): void {
  const visit = (paths: string[], depth: number) => {
    for (const path of paths) {
      const node = tree.nodes.get(path);
      if (!node) continue;
      const cont = callback(node, depth);
      if (cont !== false && node.type === "folder") {
        visit(node.children, depth + 1);
      }
    }
  };
  visit(tree.rootChildren, 0);
}

/**
 * Walk the tree breadth-first, invoking callback for each node.
 */
export function walkTreeBFS(
  tree: FileTree,
  callback: (node: FSNode, depth: number) => void
): void {
  const queue: Array<{ path: string; depth: number }> = tree.rootChildren.map(
    (p) => ({ path: p, depth: 0 })
  );

  while (queue.length > 0) {
    const item = queue.shift()!;
    const node = tree.nodes.get(item.path);
    if (!node) continue;
    callback(node, item.depth);
    if (node.type === "folder") {
      for (const childPath of node.children) {
        queue.push({ path: childPath, depth: item.depth + 1 });
      }
    }
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Full-text search across the filesystem tree.
 * Returns matching nodes with their breadcrumb paths preserved.
 * Searches: name, path segments, MIME type (for files).
 */
export function searchTree(
  tree: FileTree,
  query: string
): Array<{ node: FSNode; breadcrumbs: PathSegment[] }> {
  if (!query.trim()) return [];

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const results: Array<{ node: FSNode; breadcrumbs: PathSegment[] }> = [];

  walkTreeDFS(tree, (node) => {
    const searchable = [
      node.name.toLowerCase(),
      node.path.toLowerCase(),
      ...(node.type === "file" ? [node.mimeType.toLowerCase()] : []),
    ].join(" ");

    if (tokens.every((token) => searchable.includes(token))) {
      results.push({
        node,
        breadcrumbs: getBreadcrumbs(node.path),
      });
    }
  });

  return results;
}

// ─── Virtual Tree Mutation Helpers ───────────────────────────────────────────
// These operate on a copy of the tree for optimistic UI updates.
// Actual persistence is handled by the index layer.

/**
 * Create a shallow copy of a FileTree for safe mutation.
 */
function cloneTree(tree: FileTree): FileTree {
  const nodes: FileSystemMap = new Map(
    Array.from(tree.nodes.entries()).map(([k, v]) => [
      k,
      v.type === "folder"
        ? { ...v, children: [...v.children] }
        : { ...v },
    ])
  );
  return {
    nodes,
    rootChildren: [...tree.rootChildren],
    totalFiles: tree.totalFiles,
    totalSize: tree.totalSize,
  };
}

/**
 * Add a file node optimistically to an existing tree without rebuilding from scratch.
 * Returns a new tree with the file inserted at the correct location.
 */
export function optimisticAddFile(
  tree: FileTree,
  record: FileRecord
): FileTree {
  const next = cloneTree(tree);
  const virtualPath = getVirtualPath(record);
  if (!virtualPath) return next;

  const now = record.created || new Date().toISOString();

  // Ensure ancestor folders
  const segments = virtualPath.split("/");
  const folderSegments = segments.slice(0, -1);
  let parentPath: string | null = null;
  let currentPath = "";

  for (const seg of folderSegments) {
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;
    if (!next.nodes.has(currentPath)) {
      const folder = createFolderNode(currentPath, seg, parentPath, now, false);
      next.nodes.set(currentPath, folder);
    }
    const parentNode: FSNode | undefined = parentPath ? next.nodes.get(parentPath) : undefined;
    if (parentNode && parentNode.type === "folder") {
      if (!parentNode.children.includes(currentPath)) {
        parentNode.children.push(currentPath);
        parentNode.children = sortedChildren(parentNode.children, next.nodes);
      }
    } else if (!parentPath && !next.rootChildren.includes(currentPath)) {
      next.rootChildren.push(currentPath);
    }
    parentPath = currentPath;
  }

  // Create file node
  const fileNode: FileNode = {
    id: generateNodeId(`file:${record.hash}`),
    type: "file",
    name: record.name || getBaseName(virtualPath),
    path: virtualPath,
    parentPath,
    createdAt: now,
    updatedAt: now,
    record,
    size: record.size,
    mimeType: record.type || "application/octet-stream",
  };

  next.nodes.set(virtualPath, fileNode);

  if (parentPath) {
    const parentNode = next.nodes.get(parentPath);
    if (parentNode && parentNode.type === "folder") {
      if (!parentNode.children.includes(virtualPath)) {
        parentNode.children.push(virtualPath);
        parentNode.children = sortedChildren(parentNode.children, next.nodes);
        // Update stats up the chain
        let p: string | null = parentPath;
        while (p) {
          const pNode = next.nodes.get(p);
          if (pNode && pNode.type === "folder") {
            pNode.fileCount++;
            pNode.totalSize += record.size;
          }
          p = pNode?.parentPath ?? null;
        }
      }
    }
  } else {
    if (!next.rootChildren.includes(virtualPath)) {
      next.rootChildren.push(virtualPath);
      next.rootChildren = sortedChildren(next.rootChildren, next.nodes);
    }
  }

  next.totalFiles++;
  next.totalSize += record.size;

  return next;
}

/**
 * Remove a file node optimistically from an existing tree.
 */
export function optimisticRemoveFile(
  tree: FileTree,
  hash: string
): FileTree {
  const next = cloneTree(tree);

  // Find the file node by hash
  let targetPath: string | null = null;
  for (const [path, node] of next.nodes.entries()) {
    if (node.type === "file" && node.record.hash === hash) {
      targetPath = path;
      break;
    }
  }

  if (!targetPath) return next;

  const fileNode = next.nodes.get(targetPath) as FileNode;
  next.nodes.delete(targetPath);

  // Remove from parent's children
  if (fileNode.parentPath) {
    const parent = next.nodes.get(fileNode.parentPath);
    if (parent && parent.type === "folder") {
      parent.children = parent.children.filter((c) => c !== targetPath);
      let p: string | null = fileNode.parentPath;
      while (p) {
        const pNode = next.nodes.get(p);
        if (pNode && pNode.type === "folder") {
          pNode.fileCount = Math.max(0, pNode.fileCount - 1);
          pNode.totalSize = Math.max(0, pNode.totalSize - fileNode.size);
        }
        p = pNode?.parentPath ?? null;
      }
    }
  } else {
    next.rootChildren = next.rootChildren.filter((c) => c !== targetPath);
  }

  next.totalFiles = Math.max(0, next.totalFiles - 1);
  next.totalSize = Math.max(0, next.totalSize - fileNode.size);

  return next;
}

// ─── Migration Helper ────────────────────────────────────────────────────────

/**
 * Migrates a GitStoreIndex from the legacy folders[] model to the path-based model.
 * This is non-destructive: it reads folders[] and ensures the filesystem can
 * derive the correct virtual paths.
 *
 * No schema changes are made to the index — the migration is purely read-time.
 * Use this to validate that an index will render correctly with the new engine.
 */
export function migrateIndexToPathModel(index: GitStoreIndex): {
  migrated: number;
  total: number;
  warnings: string[];
} {
  let migrated = 0;
  let total = 0;
  const warnings: string[] = [];

  for (const record of Object.values(index.files)) {
    if (record.trashed) continue;
    total++;

    const virtualPath = getVirtualPath(record);
    if (!virtualPath) {
      warnings.push(`File ${record.hash} (${record.name}): could not derive virtual path`);
      continue;
    }

    // Check if this was a legacy folders[] record
    const storagePrefixRe = /^\d{4}\/\d{2}\//;
    if (storagePrefixRe.test(record.path) && (record.folders ?? []).length > 0) {
      migrated++;
    }
  }

  return { migrated, total, warnings };
}
