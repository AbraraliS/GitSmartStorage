/**
 * mobile/lib/api.ts
 * Thin wrapper around the GitStore Next.js API.
 * The mobile app always calls the server — it never calls GitHub directly.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FileRecord, DataNode, GitStoreIndex } from "../../types";

// Change this to your deployed Next.js URL or local tunnel for dev
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await AsyncStorage.getItem("session_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error: string }).error);
  }

  return res.json() as Promise<T>;
}

// ── Index ──────────────────────────────────────────────────────────────────

const INDEX_CACHE_KEY = "gitstore_index";

export async function fetchIndex(forceRefresh = false): Promise<GitStoreIndex | null> {
  if (!forceRefresh) {
    const cached = await AsyncStorage.getItem(INDEX_CACHE_KEY);
    if (cached) return JSON.parse(cached) as GitStoreIndex;
  }

  const data = await apiFetch<{ index: GitStoreIndex | null }>("/api/sync");
  if (data.index) {
    await AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(data.index));
  }
  return data.index;
}

// ── Files ──────────────────────────────────────────────────────────────────

export async function listFiles(q = "", node?: string): Promise<FileRecord[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (node) params.set("node", node);
  const query = params.toString();

  const data = await apiFetch<{ files: FileRecord[] }>(
    `/api/files${query ? `?${query}` : ""}`
  );
  return data.files;
}

export async function deleteFile(hash: string): Promise<void> {
  await apiFetch(`/api/files?hash=${hash}`, { method: "DELETE" });
}

export function getDownloadUrl(hash: string): string {
  return `${API_BASE}/api/files/download?hash=${hash}`;
}

// ── Nodes ──────────────────────────────────────────────────────────────────

export async function listNodes(): Promise<DataNode[]> {
  const data = await apiFetch<{ nodes: DataNode[] }>("/api/nodes");
  return data.nodes;
}

export async function createNode(name: string): Promise<DataNode> {
  const data = await apiFetch<{ node: DataNode }>("/api/nodes", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.node;
}
