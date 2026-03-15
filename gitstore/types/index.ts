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

export interface FileRecord {
  /** First 6 chars of SHA-256 hash — used as primary key */
  hash: string;
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
  /** Virtual folder path, e.g. "2024/Holidays". Defaults to "/". */
  folder?: string;
  /** Base64 JPEG thumbnail (200x150). Null/undefined for non-visual files. */
  thumbnail?: string;
  /** User-starred file marker. */
  starred?: boolean;
  /** Soft-delete marker for trash view. */
  trashed?: boolean;
  /** ISO timestamp of when the file was moved to trash. */
  trashedAt?: string;
}

export interface GitStoreIndex {
  /** Map of node id → DataNode */
  nodes: Record<string, DataNode>;
  /** Map of hash → FileRecord */
  files: Record<string, FileRecord>;
  /** keyword → list of hashes */
  search_index: Record<string, string[]>;
  /** Virtual folder map */
  folders?: Record<string, { name: string; node: string; parent: string; created: string }>;
  /** ISO last-modified timestamp */
  updated_at?: string;
  /** Schema version for future migrations */
  version?: number;
}

// ─── Upload Pipeline ────────────────────────────────────────────────────────

export interface UploadChunk {
  index: number;
  data: string; // base64-encoded (and optionally encrypted) content
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
