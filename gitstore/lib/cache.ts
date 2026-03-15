/**
 * lib/cache.ts
 * 5-layer cache hierarchy:
 *   L1 — in-memory Map  (0 ms)
 *   L2 — IndexedDB via idb  (5 ms)
 *   L3 — Service Worker / Workbox  (10 ms) — managed by SW, not this module
 *   L4 — Cloudflare Worker CDN proxy  (20-50 ms) — transparent URL swap
 *   L5 — GitHub API  (fallback)
 */

"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { GitStoreIndex } from "@/types";

// ─── L1: In-memory Map ────────────────────────────────────────────────────

const L1_INDEX_KEY = "__gitstore_index__";

/** L1 cache — survives the current browser session only */
const memoryCache = new Map<string, unknown>();

export function l1GetIndex(): GitStoreIndex | null {
  return (memoryCache.get(L1_INDEX_KEY) as GitStoreIndex) ?? null;
}

export function l1SetIndex(index: GitStoreIndex): void {
  memoryCache.set(L1_INDEX_KEY, index);
}

export function l1Invalidate(): void {
  memoryCache.delete(L1_INDEX_KEY);
}

// ─── L2: IndexedDB ────────────────────────────────────────────────────────

const DB_NAME = "gitstore-cache";
const DB_VERSION = 1;
const INDEX_STORE = "index";
const BLOB_STORE = "blobs";

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(INDEX_STORE)) {
        db.createObjectStore(INDEX_STORE);
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    },
  });
  return _db;
}

export async function l2GetIndex(): Promise<GitStoreIndex | null> {
  try {
    const db = await getDB();
    const raw = await db.get(INDEX_STORE, "main");
    if (!raw) return null;
    return raw as GitStoreIndex;
  } catch {
    return null;
  }
}

export async function l2SetIndex(index: GitStoreIndex): Promise<void> {
  try {
    const db = await getDB();
    await db.put(INDEX_STORE, index, "main");
  } catch {
    // IDB write failures are non-fatal
  }
}

export async function l2InvalidateIndex(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(INDEX_STORE, "main");
  } catch {}
}

/** Cache a file blob in IndexedDB keyed by hash */
export async function l2CacheBlob(hash: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    await db.put(BLOB_STORE, blob, hash);
  } catch {}
}

/** Retrieve a cached file blob from IndexedDB */
export async function l2GetBlob(hash: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    const result = await db.get(BLOB_STORE, hash);
    return result ?? null;
  } catch {
    return null;
  }
}

export async function l2DeleteBlob(hash: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(BLOB_STORE, hash);
  } catch {}
}

// ─── Composite helpers ────────────────────────────────────────────────────

/**
 * Load the index using the cache hierarchy.
 * Returns the index from the fastest available layer.
 * Also primes missing layers as a side-effect.
 *
 * If everything is empty, caller should fetch from GitHub API (L5).
 */
export async function loadIndex(): Promise<GitStoreIndex | null> {
  // L1
  const l1 = l1GetIndex();
  if (l1) return l1;

  // L2
  const l2 = await l2GetIndex();
  if (l2) {
    l1SetIndex(l2); // prime L1
    return l2;
  }

  return null; // caller must fetch from L5
}

/**
 * After fetching from GitHub API (L5), populate L1 and L2.
 */
export async function populateCacheLayers(index: GitStoreIndex): Promise<void> {
  l1SetIndex(index);
  await l2SetIndex(index);
}

/**
 * After any write operation, update both L1 and L2 atomically.
 */
export async function updateCacheAfterWrite(
  index: GitStoreIndex
): Promise<void> {
  l1SetIndex(index);
  await l2SetIndex(index);
}

// ─── L4: Cloudflare Worker CDN URL swap ──────────────────────────────────

const CDN_URL = process.env.NEXT_PUBLIC_CDN_WORKER_URL ?? "";

/**
 * If a Cloudflare Worker CDN is configured, return the proxied URL.
 * Otherwise return the raw GitHub URL unchanged (L5 direct).
 */
export function proxiedFileUrl(rawGithubUrl: string): string {
  if (!CDN_URL) return rawGithubUrl;
  const encoded = encodeURIComponent(rawGithubUrl);
  return `${CDN_URL}/proxy?url=${encoded}`;
}
