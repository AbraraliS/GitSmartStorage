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
  /** First 12 hex chars of upload-key hash — primary key */
  hash: string;
  /** Original content hash. */
  contentHash?: string;
  name: string;
  /** Target data node id */
  node: string;
  /**
   * Canonical virtual filesystem path for this file, e.g. "Work/Reports/2026/report.pdf".
   * This is the SINGLE SOURCE OF TRUTH for filesystem placement.
   * When set, the file appears at this location in the virtual tree.
   * Legacy files may use `folders[]` instead — the filesystem engine normalizes both.
   */
  path: string;
  /** Size in bytes */
  size: number;
  type: string;
  tags: string[];
  created: string;
  sync_status: "synced" | "syncing" | "error" | "pending";
  /** Set for chunked files — array of chunk storage paths inside repo */
  chunks?: string[];
  /** Whether file was stored via Git LFS */
  lfs?: boolean;
  /** SHA of the GitHub blob — needed for delete/update (server-only, never returned to client) */
  sha?: string;
  /** Base64-encoded AES-GCM IV used to encrypt this file on the client */
  iv?: string;
  /** Base64-encoded raw AES-256-GCM key exported from SubtleCrypto (stored in private index.json) */
  encryptionKey?: string;
  /**
   * @deprecated Use `path` (virtualPath) instead.
   * Legacy field: folder paths this file belongs to.
   * Migration: filesystem engine reads this and converts to path-based placement.
   */
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
  /**
   * Upload pipeline version that stored this file.
   * 1 = legacy (50MB fixed chunks, double-base64)
   * 2 = adaptive (single/chunked mode, correct base64)
   */
  uploadVersion?: number;
  /** Upload mode used: "single" | "chunked" | "legacy" */
  uploadMode?: "single" | "chunked" | "legacy";
  /** Chunk size in bytes used when uploadMode === "chunked" */
  chunkSize?: number;
  /** SHA-256 hex checksum of the full original file content */
  checksum?: string;
  /** Algorithm used for checksum, e.g. "sha-256" */
  hashAlgorithm?: string;
  /**
   * Encryption readiness fields — populated when AES-GCM is implemented.
   * Left as undefined for all current uploads (no encryption yet).
   */
  encrypted?: boolean;
  encryptionVersion?: number;
  encryptionAlgorithm?: string;
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

// ─── Virtual Filesystem Types ────────────────────────────────────────────────

/** Segment of a path for breadcrumb rendering */
export interface PathSegment {
  label: string;
  /** Navigable path (undefined for the last/current segment) */
  path: string;
  isLast: boolean;
}

/** Shared base for all filesystem nodes */
export interface BaseNode {
  /** Deterministic ID derived from path hash */
  id: string;
  /** Display name (last path segment) */
  name: string;
  /** Full virtual path, e.g. "Work/Reports/2026" */
  path: string;
  /** Parent path, null for root-level nodes */
  parentPath: string | null;
  /** ISO creation timestamp */
  createdAt: string;
  updatedAt: string;
}

/** A file leaf node in the virtual filesystem */
export interface FileNode extends BaseNode {
  type: "file";
  record: FileRecord;
  size: number;
  mimeType: string;
}

/** A folder node in the virtual filesystem */
export interface FolderNode extends BaseNode {
  type: "folder";
  /** Paths of direct children (files and folders) */
  children: string[];
  /** Total file count (recursive) */
  fileCount: number;
  /** Total size in bytes (recursive) */
  totalSize: number;
  /** Whether this folder was explicitly created (vs. auto-derived from file paths) */
  explicit?: boolean;
  /** Whether folder is starred */
  starred?: boolean;
  /** Whether the folder is expanded in the UI */
  expanded?: boolean;
  /** Cover thumbnail hash */
  coverId?: string;
}

export type FSNode = FileNode | FolderNode;

/**
 * O(1) path → node lookup map.
 * Root-level entries are children of the synthetic "/" root.
 */
export type FileSystemMap = Map<string, FSNode>;

/** The top-level filesystem structure returned by buildFileTree() */
export interface FileTree {
  /** All nodes keyed by path */
  nodes: FileSystemMap;
  /** Paths of direct root-level nodes (sorted: folders first, then files) */
  rootChildren: string[];
  /** Total file count across entire tree */
  totalFiles: number;
  /** Total size across entire tree */
  totalSize: number;
}

// ─── Upload Pipeline ────────────────────────────────────────────────────────

export interface UploadChunk {
  index: number;
  /** Base64 string (single-encoded) — ready for the GitHub Contents API content field. */
  data: string;
  path: string; // storage path inside repo
  sha?: string; // existing blob SHA (for updates)
  /** Byte offset in the original file where this chunk starts */
  byteOffset: number;
  /** Size of this chunk in bytes (before base64 encoding) */
  byteLength: number;
  /** Base64-encoded 12-byte AES-GCM IV for this chunk (reserved for future encryption) */
  iv?: string;
}

/**
 * Upload phase — describes what the pipeline is currently doing.
 * Shown as a human-readable label in the UploadTray.
 */
export type UploadPhase =
  | "preparing"   // reading file metadata, choosing strategy
  | "hashing"     // computing SHA-256 checksum
  | "uploading"   // transferring chunks to GitHub
  | "finalizing"  // committing index record
  | "syncing";    // background GitHub round-trip

/**
 * Multi-phase, byte-accurate upload progress model.
 *
 * Use `percentage` for the progress bar — it is byte-based and will move
 * smoothly even with large chunks. Do NOT calculate percentage from
 * completedChunks/totalChunks.
 */
export interface UploadProgress {
  fileId: string;
  filename: string;

  /** Current pipeline phase */
  phase: UploadPhase;

  /** Backward-compat status for existing consumers */
  status: "hashing" | "dedup" | "uploading" | "indexing" | "done" | "error";

  /** Total file size in bytes */
  totalBytes: number;
  /** Bytes fully processed (hashed + prepared) so far */
  processedBytes: number;
  /** Bytes confirmed uploaded to GitHub so far */
  uploadedBytes: number;

  /** Total chunks (1 for single-mode uploads) */
  totalChunks: number;
  /** Chunks whose upload request completed successfully */
  completedChunks: number;

  /** 0–100, byte-based. This is what the progress bar should use. */
  percentage: number;

  /** Smoothed upload speed in MB/s (undefined until first chunk completes) */
  speedMbps?: number;
  /** Estimated seconds to completion (undefined until first chunk completes) */
  etaSeconds?: number;
  /** Index of the chunk currently being uploaded (0-based) */
  currentChunk?: number;

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
  folderPath?: string; // restrict to a specific folder path
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
