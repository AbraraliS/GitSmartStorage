/**
 * lib/upload-session.ts
 * Persistent upload session management via IndexedDB.
 *
 * Enables:
 *   - Resumable uploads (survive refresh/crash)
 *   - Per-chunk progress persistence
 *   - Orphan detection
 *   - Dedup via blobSha manifest
 *
 * Schema version 1.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadSessionStatus =
  | "uploading"    // chunks in progress
  | "uploaded"     // all blobs uploaded, finalize pending
  | "finalizing"   // finalize API called
  | "committed"    // commit created on GitHub
  | "completed"    // index updated, done
  | "failed"       // unrecoverable error
  | "orphaned";    // blobs uploaded, finalize never succeeded

export interface UploadSession {
  sessionId: string;           // UUIDv4
  fileHash: string;            // first 12 hex chars of SHA-256 (dedup key)
  checksum: string;            // full 64-char SHA-256 hex
  fileName: string;
  fileSize: number;
  repo: string;
  uploadMode: "single" | "chunked";
  chunkSize: number;
  totalChunks: number;
  /** blobSha per chunk index — null means not yet uploaded */
  blobShas: (string | null)[];
  /** Path per chunk (needed to rebuild finalize payload) */
  chunkPaths: string[];
  basePath: string;
  status: UploadSessionStatus;
  commitSha?: string;
  startedAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
  /** Retry count per chunk index */
  retryCounts: number[];
  /** Error message if status === "failed" */
  lastError?: string;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const DB_NAME = "gitstore-uploads";
const DB_VERSION = 1;
const STORE = "sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "sessionId" });
        store.createIndex("by_fileHash", "fileHash", { unique: false });
        store.createIndex("by_status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Persist or update a session. */
export async function saveSession(session: UploadSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...session, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Get a session by ID. */
export async function getSession(sessionId: string): Promise<UploadSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Find an existing incomplete session for a given file hash.
 * Returns the most recent one (by updatedAt) or null.
 */
export async function findResumableSession(fileHash: string): Promise<UploadSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("by_fileHash");
    const req = idx.getAll(fileHash);
    req.onsuccess = () => {
      db.close();
      const sessions = (req.result as UploadSession[]).filter(
        (s) => s.status === "uploading" || s.status === "uploaded" || s.status === "orphaned"
      );
      if (sessions.length === 0) { resolve(null); return; }
      // Return most recently updated session
      sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(sessions[0]);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Update a single chunk's blobSha after successful upload. */
export async function persistChunkBlobSha(
  sessionId: string,
  chunkIndex: number,
  blobSha: string
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.blobShas[chunkIndex] = blobSha;
  session.status = "uploading";
  await saveSession(session);
}

/** Mark all blobs uploaded — ready for finalize. */
export async function markUploaded(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.status = "uploaded";
  await saveSession(session);
}

/** Mark finalize in progress. */
export async function markFinalizing(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.status = "finalizing";
  await saveSession(session);
}

/** Mark session committed (finalize succeeded). */
export async function markCommitted(sessionId: string, commitSha: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.status = "committed";
  session.commitSha = commitSha;
  await saveSession(session);
}

/** Mark session fully completed (index written). */
export async function markCompleted(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.status = "completed";
  await saveSession(session);
}

/** Mark session failed. */
export async function markFailed(sessionId: string, error: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.status = "failed";
  session.lastError = error;
  await saveSession(session);
}

/** Delete a session (after completion or discard). */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** List all sessions that are not completed/failed (for recovery UI). */
export async function listPendingSessions(): Promise<UploadSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const pending = (req.result as UploadSession[]).filter(
        (s) => s.status !== "completed" && s.status !== "failed"
      );
      resolve(pending);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Purge sessions older than `maxAgeMs` that are still in uploading/orphaned state. */
export async function purgeOrphanedSessions(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const db = await openDB();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    let deleted = 0;
    req.onsuccess = () => {
      const sessions = req.result as UploadSession[];
      for (const s of sessions) {
        if (
          (s.status === "orphaned" || s.status === "uploading") &&
          s.updatedAt < cutoff
        ) {
          store.delete(s.sessionId);
          deleted++;
        }
      }
      tx.oncomplete = () => { db.close(); resolve(deleted); };
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ─── Session factory ──────────────────────────────────────────────────────────

export function createSession(params: {
  fileHash: string;
  checksum: string;
  fileName: string;
  fileSize: number;
  repo: string;
  uploadMode: "single" | "chunked";
  chunkSize: number;
  basePath: string;
  chunkPaths: string[];
}): UploadSession {
  const totalChunks = params.chunkPaths.length;
  return {
    sessionId: crypto.randomUUID(),
    fileHash: params.fileHash,
    checksum: params.checksum,
    fileName: params.fileName,
    fileSize: params.fileSize,
    repo: params.repo,
    uploadMode: params.uploadMode,
    chunkSize: params.chunkSize,
    totalChunks,
    blobShas: new Array<null>(totalChunks).fill(null),
    chunkPaths: params.chunkPaths,
    basePath: params.basePath,
    status: "uploading",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCounts: new Array<number>(totalChunks).fill(0),
  };
}
