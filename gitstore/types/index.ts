// ─── Core Domain Types ─────────────────────────────────────────────────────

export interface DataNode {
  /** Short name used as both the key in nodes map and part of repo name */
  id: string;
  /** Full GitHub repo name, e.g. "gitstore-photos" */
  repo: string;
  /** Cumulative size in megabytes */
  size_mb: number;
  /** ISO creation timestamp */
  created?: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  path: string;
  parent: string;
  node?: string;
  created: string;
  coverId?: string;
  starred?: boolean;
  trashed?: boolean;
  trashedAt?: string;
}

export interface RepoShard {
  nodeId: string;
  repo: string;
  size_mb: number;
  created: string;
  isCurrent: boolean;
}

export interface FileRecord {
  /** First 6 chars of SHA-256 hash — used as primary key */
  hash: string;
  /** Original content hash. Helpful when hash becomes a derived recordKey. */
  contentHash?: string;
  name: string;
  /** Target data node id */
  node: string;
  /** File path inside the repo, e.g. "2024/vacation.jpg" */
  path: string;
  size: number;
  type: string;
  tags: string[];
  created: string;
  sync_status: "synced" | "syncing" | "error" | "pending";
  /** Set for chunked files — array of chunk paths inside repo */
  chunks?: string[];
  /** Whether file was stored via Git LFS */
  lfs?: boolean;
  /** SHA of the GitHub blob — needed for delete/update (server-only, never returned to client) */
  sha?: string;
  /** Base64-encoded AES-GCM IV used to encrypt this file on the client */
  iv?: string;
  /** Base64-encoded raw AES-256-GCM key exported from SubtleCrypto (stored in private index.json) */
  encryptionKey?: string;
  /** Folder paths this file belongs to, e.g. ["Trips/2024/Japan", "Favourites"] */
  folders?: string[];
  /** GitHub repo shard that stores this file's blob/chunks. */
  repo?: string;
  /** Base64 JPEG thumbnail (200x150). Null/undefined for non-visual files. */
  thumbnail?: string;
  /** User-starred file marker. */
  starred?: boolean;
  /** Soft-delete marker for trash view. */
  trashed?: boolean;
  /** ISO timestamp of when the file was moved to trash. */
  trashedAt?: string;
  /** True on all files uploaded after the double-base64 encoding fix (2026-03-16). */
  fixedEncoding?: boolean;
}

export interface GitStoreIndex {
  /** Map of node id → DataNode */
  nodes: Record<string, DataNode>;
  /** Map of hash → FileRecord */
  files: Record<string, FileRecord>;
  /** keyword → list of hashes */
  search_index: Record<string, string[]>;
  /** User folder metadata keyed by path */
  folders?: Record<string, FolderMeta>;
  /** Repo shard metadata keyed by node id */
  repoShards?: Record<string, RepoShard[]>;
  /** ISO last-modified timestamp */
  updated_at?: string;
  /** Schema version for future migrations */
  version?: number;
}

// ─── Upload Pipeline ────────────────────────────────────────────────────────

export interface UploadChunk {
  index: number;
  /** Base64 string (single-encoded) — ready for the GitHub Contents API content field. */
  data: string;
  path: string; // path inside repo
  sha?: string; // existing blob SHA (for updates)
  /** Base64-encoded 12-byte AES-GCM IV for this chunk (set when encryption is enabled) */
  iv?: string;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: number;
  status: "hashing" | "dedup" | "uploading" | "indexing" | "done" | "error";
  error?: string;
}

// ─── Filter & Search ────────────────────────────────────────────────────────

export interface FilterOptions {
  type?: string;       // MIME type prefix, e.g. "image"
  node?: string;       // data node id
  tags?: string[];
  dateFrom?: string;   // ISO
  dateTo?: string;
  minSize?: number;    // bytes
  maxSize?: number;
}

// ─── Background Jobs ────────────────────────────────────────────────────────

export type JobType = "sync_index" | "replicate_backup" | "refresh_cache";

export interface Job {
  id: string;
  type: JobType;
  payload?: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  created: number; // Date.now()
  error?: string;
}

// ─── Session extension for NextAuth ─────────────────────────────────────────

export interface GitStoreSession {
  accessToken: string;
  login: string;
  /** Optional secondary GitHub account token */
  backupAccessToken?: string;
  backupLogin?: string;
}
