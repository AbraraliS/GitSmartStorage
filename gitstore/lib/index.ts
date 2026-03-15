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
} from "@/types";

// ─── Empty index factory ──────────────────────────────────────────────────

export function emptyIndex(): GitStoreIndex {
  return {
    nodes: {},
    files: {},
    search_index: {},
    updated_at: new Date().toISOString(),
    version: 1,
  };
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
  index.files[record.hash] = record;

  for (const token of tokenise(record.name, record.tags)) {
    if (!index.search_index[token]) {
      index.search_index[token] = [];
    }
    if (!index.search_index[token].includes(record.hash)) {
      index.search_index[token].push(record.hash);
    }
  }
}

/**
 * Remove a FileRecord from the index (files map + search_index).
 */
export function removeFileFromIndex(
  index: GitStoreIndex,
  hash: string
): void {
  const record = index.files[hash];
  if (!record) return;

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
}

/**
 * Add or update a DataNode in the index.
 */
export function addNodeToIndex(index: GitStoreIndex, node: DataNode): void {
  index.nodes[node.id] = node;
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
  return JSON.parse(raw) as GitStoreIndex;
}
