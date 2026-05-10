/**
 * lib/upload.ts — Binary streaming upload pipeline (v2)
 *
 * Transport: browser sends raw Blob via XHR (application/octet-stream)
 * Server encodes to base64 → GitHub API.
 * Peak browser RAM: ~160MB for 2×80MB parallel chunks (vs ~640MB before).
 */

import type { UploadProgress, UploadPhase } from "@/types";
import { l1GetIndex } from "./cache";
import { classifyFile, ensureNodeExists, type NodeId } from "./nodes";
import { hashFile } from "./hash-worker";
import {
  createSession, saveSession, findResumableSession,
  persistChunkBlobSha, markUploaded, markFinalizing,
  markCommitted, markCompleted, markFailed,
} from "./upload-session";
import {
  selectUploadMode,
  selectChunkSize,
  MAX_PARALLEL_UPLOADS,
  MAX_CHUNK_RETRIES,
  BASE_RETRY_DELAY_MS,
  CHUNK_JITTER_MS,
  UPLOAD_VERSION,
  SINGLE_UPLOAD_THRESHOLD,
} from "./upload-config";

/** @deprecated Use selectChunkSize() from upload-config.ts */
export const CHUNK_SIZE = 50 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawChunk {
  index: number;
  blob: Blob;
  byteOffset: number;
  byteLength: number;
  path: string;
}

// Re-export UploadChunk shape for legacy callers (upload/page.tsx)
export type { UploadChunk } from "@/types";

// ─── Hash ────────────────────────────────────────────────────────────────────

const HASH_READ_CHUNK = 64 * 1024 * 1024;

export async function getFileHash(
  file: File
): Promise<{ shortHash: string; fullHex: string }> {
  if (file.size <= HASH_READ_CHUNK) {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return { shortHash: hex.slice(0, 12), fullHex: hex };
  }

  const chunkHashes: Uint8Array[] = [];
  let offset = 0;
  while (offset < file.size) {
    const buf = await file.slice(offset, offset + HASH_READ_CHUNK).arrayBuffer();
    chunkHashes.push(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)));
    offset += HASH_READ_CHUNK;
  }

  const combined = new Uint8Array(chunkHashes.reduce((n, h) => n + h.length, 0));
  let pos = 0;
  for (const h of chunkHashes) { combined.set(h, pos); pos += h.length; }
  const rootHash = await crypto.subtle.digest("SHA-256", combined);
  const hex = [...new Uint8Array(rootHash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { shortHash: hex.slice(0, 12), fullHex: hex };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function sliceFile(file: File, chunkSize: number, basePath: string, uploadKey: string): RawChunk[] {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const isSingle = totalChunks === 1;
  const datePrefix = basePath.split("/").slice(0, 2).join("/");

  const chunks: RawChunk[] = [];
  let offset = 0;
  while (offset < file.size) {
    const index = chunks.length;
    const end = Math.min(offset + chunkSize, file.size);
    chunks.push({
      index,
      blob: file.slice(offset, end),
      byteOffset: offset,
      byteLength: end - offset,
      path: isSingle
        ? basePath
        : `${datePrefix}/chunks/${uploadKey}/${String(index).padStart(5, "0")}`,
    });
    offset = end;
  }
  return chunks;
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

export async function generateThumbnail(blob: Blob): Promise<string | null> {
  if (blob.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = 200; canvas.height = 150;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const scale = Math.min(200 / bitmap.width, 150 / bitmap.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 200, 150);
      ctx.drawImage(bitmap, (200 - bitmap.width * scale) / 2, (150 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
      return canvas.toDataURL("image/jpeg", 0.6);
    } catch { return null; }
  }

  if (blob.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata"; video.muted = true;
      video.src = URL.createObjectURL(blob);
      video.onloadeddata = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 200; canvas.height = 150;
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(video.src);
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(video, 0, 0, 200, 150);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      video.onerror = () => { URL.revokeObjectURL(video.src); resolve(null); };
      try { video.currentTime = 1; } catch { /* ignore */ }
    });
  }
  return null;
}

// ─── Legacy prepareChunks (for upload/page.tsx compat) ───────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const comma = r.indexOf(",");
      if (comma === -1) { reject(new Error("FileReader: missing comma")); return; }
      resolve(r.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function prepareChunks(
  file: File, basePath: string, hash: string, chunkSize: number
): Promise<import("@/types").UploadChunk[]> {
  const isSingle = Math.ceil(file.size / chunkSize) === 1;
  const datePrefix = basePath.split("/").slice(0, 2).join("/");
  const result: import("@/types").UploadChunk[] = [];
  let offset = 0, index = 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const blob = file.slice(offset, end);
    const path = isSingle ? basePath : `${datePrefix}/chunks/${hash}/${String(index).padStart(5, "0")}`;
    result.push({ index, data: await blobToBase64(blob), path, byteOffset: offset, byteLength: end - offset });
    offset = end; index++;
  }
  return result;
}

// ─── XHR binary upload v2 — blob mode (no commit) ────────────────────────────

/**
 * Upload a raw Blob to /api/upload/blob, which creates a Git blob object
 * without making a commit. Returns the Git blob SHA.
 *
 * The blob SHA is collected and passed to finalizeUpload() at the end,
 * which creates a SINGLE commit for all chunks.
 */
function xhrBlobUpload(
  raw: RawChunk,
  nodeRepo: string,
  signal: AbortSignal,
  onBytesSent: (sent: number, total: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/blob");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-repo", nodeRepo);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytesSent(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        let blobSha = "";
        try { blobSha = (JSON.parse(xhr.responseText) as { blobSha?: string }).blobSha ?? ""; } catch { /* ignore */ }
        if (!blobSha) { reject(new Error(`Chunk ${raw.index}: missing blobSha in response`)); return; }
        onBytesSent(raw.byteLength, raw.byteLength);
        resolve(blobSha);
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg; } catch { /* ignore */ }
        reject(new Error(`Chunk ${raw.index} blob upload failed: ${msg}`));
      }
    };

    xhr.onerror = () => reject(new TypeError(`Chunk ${raw.index}: network error`));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal.aborted) { xhr.abort(); return; }
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(raw.blob);
  });
}

/**
 * XHR upload for single-file mode — still uses /api/upload/chunk (Contents API)
 * because single files don't benefit from blob+finalize and need the SHA immediately.
 */
function xhrChunkUpload(
  raw: RawChunk,
  nodeRepo: string,
  signal: AbortSignal,
  onBytesSent: (sent: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/upload/chunk");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-repo", nodeRepo);
    xhr.setRequestHeader("x-chunk-path", raw.path);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytesSent(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 422) {
        onBytesSent(raw.byteLength, raw.byteLength);
        resolve();
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg; } catch { /* ignore */ }
        reject(new Error(`Upload failed: ${msg}`));
      }
    };

    xhr.onerror = () => reject(new TypeError("Network error"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal.aborted) { xhr.abort(); return; }
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(raw.blob);
  });
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function uploadWithRetry(
  raw: RawChunk,
  nodeRepo: string,
  mode: "blob" | "chunk",
  signal: AbortSignal,
  onBytesSent: (sent: number, total: number) => void,
  attempt = 0
): Promise<string | void> {
  if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");

  if (attempt > 0) {
    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * CHUNK_JITTER_MS;
    await new Promise((r) => setTimeout(r, delay));
    console.warn(`[upload] retry ${attempt} for chunk ${raw.index}`);
  }

  try {
    if (mode === "blob") {
      return await xhrBlobUpload(raw, nodeRepo, signal, onBytesSent);
    } else {
      return await xhrChunkUpload(raw, nodeRepo, signal, onBytesSent);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (attempt < MAX_CHUNK_RETRIES) return uploadWithRetry(raw, nodeRepo, mode, signal, onBytesSent, attempt + 1);
    throw err;
  }
}

// ─── Parallel streaming scheduler ────────────────────────────────────────────

/**
 * Upload raw chunks with bounded parallelism.
 *
 * mode "blob" — uses Git Data API (createBlob, no commit) → returns blobShas[].
 *               Used for chunked uploads (>80MB). Finalize with finalizeUpload().
 * mode "chunk" — uses Contents API (commit per chunk). Used for single uploads.
 *
 * onBytesProgress fires continuously with per-chunk byte-level progress.
 */
export async function streamingUpload(
  rawChunks: RawChunk[],
  nodeRepo: string,
  mode: "blob" | "chunk",
  signal: AbortSignal,
  onBytesProgress: (chunkIndex: number, sent: number, total: number) => void,
  blobShas: string[] = new Array<string>(rawChunks.length).fill("")
): Promise<string[]> {
  const chunkSent = new Array<number>(rawChunks.length).fill(0);

  let i = 0;
  const concurrency = Math.min(MAX_PARALLEL_UPLOADS, rawChunks.length);

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
      const myIndex = i++;
      if (myIndex >= rawChunks.length) break;

      const raw = rawChunks[myIndex];
      console.debug(
        `[upload] chunk ${raw.index + 1}/${rawChunks.length} start ` +
        `(${(raw.byteLength / 1024 / 1024).toFixed(1)}MB) mode=${mode} t=${Date.now()}`
      );

      const result = await uploadWithRetry(raw, nodeRepo, mode, signal, (sent, _total) => {
        chunkSent[raw.index] = sent;
        onBytesProgress(raw.index, sent, raw.byteLength);
      });

      if (typeof result === "string") blobShas[raw.index] = result;
      console.debug(`[upload] chunk ${raw.index + 1}/${rawChunks.length} done`);
    }
  });

  await Promise.all(workers);
  return blobShas;
}

// Backward compat alias
export { streamingUpload as uploadChunksBatched };

/**
 * Call POST /api/upload/finalize to create a single Git commit
 * from the blobs uploaded via xhrBlobUpload.
 */
async function finalizeUploadWithResult(
  repo: string,
  chunks: RawChunk[],
  blobShas: string[],
  signal: AbortSignal
): Promise<{ commitSha: string }> {
  const blobs = chunks
    .map((c) => ({ path: c.path, blobSha: blobShas[c.index] }))
    .filter((b) => b.blobSha);
  const res = await fetch("/api/upload/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, blobs, message: `chore: upload ${chunks.length} chunk(s)` }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Finalize failed" }));
    throw new Error((err as { error?: string }).error ?? "Finalize failed");
  }
  const data = await res.json() as { commitSha?: string };
  return { commitSha: data.commitSha ?? "" };
}


// ─── Filename conflict resolution ─────────────────────────────────────────────

function resolveFilename(name: string, index: ReturnType<typeof l1GetIndex>): string {
  if (!index) return name;
  const existing = new Set(Object.values(index.files).map((f) => f.name.toLowerCase()));
  if (!existing.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext  = dot > 0 ? name.slice(dot) : "";
  const clean = base.replace(/\s*\(\d+\)$/, "");
  let n = 1;
  while (existing.has(`${clean} (${n})${ext}`.toLowerCase())) n++;
  return `${clean} (${n})${ext}`;
}

// ─── Progress factory ─────────────────────────────────────────────────────────

function makeProgress(
  filename: string, fileSize: number, phase: UploadPhase,
  status: UploadProgress["status"], uploadedBytes: number,
  totalChunks: number, completedChunks: number,
  speedMbps?: number, etaSeconds?: number, currentChunk?: number
): UploadProgress {
  return {
    fileId: "", filename, phase, status,
    totalBytes: fileSize, processedBytes: uploadedBytes, uploadedBytes,
    totalChunks, completedChunks,
    percentage: fileSize > 0 ? Math.min(100, Math.round((uploadedBytes / fileSize) * 100)) : (status === "done" ? 100 : 0),
    speedMbps, etaSeconds, currentChunk,
  };
}

// ─── Pipeline options & result ────────────────────────────────────────────────

export interface UploadPipelineOptions {
  file: File;
  nodeRepo?: string;
  nodeName?: string;
  userOverride?: string;
  sessionCsrfToken?: string;
  folder?: string;
  tags?: string[];
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadPipelineResult {
  hash: string;
  contentHash?: string;
  checksum: string;
  path: string;
  nodeName: string;
  nodeRepo: string;
  thumbnail: string | null;
  folder: string;
  chunks: string[];
  skipped: boolean;
  fixedEncoding?: boolean;
  resolvedName: string;
  uploadMode: "single" | "chunked" | "legacy";
  chunkSize: number;
  uploadVersion: number;
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

export async function runUploadPipeline(options: UploadPipelineOptions): Promise<UploadPipelineResult> {
  const {
    file, nodeRepo, nodeName, userOverride, sessionCsrfToken,
    folder = "/", onProgress, signal = new AbortController().signal,
  } = options;

  const fileSize = file.size;
  const uploadMode = selectUploadMode(fileSize);
  const chunkSize = uploadMode === "single" ? fileSize : selectChunkSize(fileSize);
  const estimatedChunks = Math.max(1, Math.ceil(fileSize / chunkSize));

  console.info("[upload] strategy:", {
    fileName: file.name,
    fileSize: `${(fileSize / 1024 / 1024).toFixed(1)} MB`,
    uploadMode,
    chunkSizeMB: Math.round(chunkSize / 1024 / 1024),
    estimatedChunks,
    maxParallel: MAX_PARALLEL_UPLOADS,
    transport: "binary/octet-stream",
  });

  const report = (
    phase: UploadPhase, status: UploadProgress["status"],
    uploadedBytes: number, completedChunks: number,
    speedMbps?: number, etaSeconds?: number, currentChunk?: number
  ) => onProgress?.(makeProgress(file.name, fileSize, phase, status, uploadedBytes, estimatedChunks, completedChunks, speedMbps, etaSeconds, currentChunk));

  // Phase 1: Preparing
  report("preparing", "hashing", 0, 0);

  // Phase 2: Hash off main thread via Web Worker (falls back to main thread if unavailable)
  const { shortHash, fullHex } = await hashFile(file, (processed, total) => {
    // Show hashing progress — important for 500MB+ files where hashing takes 5–15s
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    report("hashing", "hashing", Math.round((processed / total) * fileSize), 0);
    void pct; // pct is implicit from byte ratio
  });
  report("hashing", "hashing", 0, 0);

  const uploadKeyInput = `${shortHash}:${file.name}:${Date.now()}`;
  const uploadKeyBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uploadKeyInput));
  const uploadKey = [...new Uint8Array(uploadKeyBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);

  report("hashing", "hashing", 0, 0);

  // Node / repo resolution
  const index = l1GetIndex();
  const autoNode = classifyFile(file.type || "application/octet-stream");
  const targetNode = (userOverride ?? nodeName ?? autoNode) as NodeId;

  if (index && !ensureNodeExists(index, targetNode)) {
    await fetch("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sessionCsrfToken ? { "x-csrf-token": sessionCsrfToken } : {}) },
      body: JSON.stringify({ name: targetNode }), signal,
    });
  }

  const resolvedNode = nodeName ?? targetNode;

  const targetRes = await fetch("/api/upload/target", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionCsrfToken ? { "x-csrf-token": sessionCsrfToken } : {}) },
    body: JSON.stringify({ nodeId: resolvedNode }), signal,
  });
  if (!targetRes.ok) {
    const e = await targetRes.json().catch(() => ({ error: "Failed to resolve upload target" }));
    throw new Error((e as { error?: string }).error ?? "Failed to resolve upload target");
  }
  const { repo: resolvedRepoRaw } = await targetRes.json() as { repo: string };
  const resolvedRepo = resolvedRepoRaw ?? nodeRepo ?? index?.nodes[targetNode]?.repo ?? `gitstore-${targetNode}`;

  // Thumbnail (non-blocking; use 4MB slice for large files)
  const thumbBlob = fileSize <= SINGLE_UPLOAD_THRESHOLD ? file : file.slice(0, 4 * 1024 * 1024);
  const thumbnail = await generateThumbnail(thumbBlob);

  // Build paths
  const date = new Date();
  const basePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${uploadKey}_${
    resolveFilename(file.name, l1GetIndex())
      .replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/__+/g, "_").replace(/^_+|_+$/g, "")
  }`;
  const resolvedName = resolveFilename(file.name, l1GetIndex());

  // Phase 3: Streaming upload — binary transport, real byte progress
  const rawChunks = sliceFile(file, chunkSize, basePath, uploadKey);
  const totalChunks = rawChunks.length;

  console.info(`[upload] ${totalChunks} chunk(s) × ${Math.round(chunkSize / 1024 / 1024)}MB, ` +
    `${MAX_PARALLEL_UPLOADS} parallel, mode=${uploadMode}, transport=binary`);

  // Route to correct upload mode:
  //   "single"  → /api/upload/chunk (Contents API, 1 commit immediately)
  //   "chunked" → /api/upload/blob × N + /api/upload/finalize (1 commit total)
  const xhrMode = uploadMode === "chunked" ? "blob" : "chunk";

  report("uploading", "uploading", 0, 0, undefined, undefined, 0);

  // Per-chunk byte tracking for smooth aggregate progress
  const chunkSentBytes = new Array<number>(totalChunks).fill(0);
  const speedSamples: { bytes: number; ms: number }[] = [];
  let completedChunks = 0;
  const uploadStartMs = Date.now();

  // ── Session management: create or resume ───────────────────────────────────
  let session = await findResumableSession(shortHash).catch(() => null);
  const isResume = !!session;

  if (session) {
    console.info(`[upload] resuming session ${session.sessionId} (${rawChunks.length - session.blobShas.filter(Boolean).length} chunk(s) remaining)`);
  } else {
    session = createSession({
      fileHash: shortHash, checksum: fullHex,
      fileName: file.name, fileSize,
      repo: resolvedRepo,
      uploadMode: uploadMode === "chunked" ? "chunked" : "single",
      chunkSize,
      basePath,
      chunkPaths: rawChunks.map((c) => c.path),
    });
    await saveSession(session).catch(console.warn); // IndexedDB failure is non-fatal
  }

  // Only upload chunks that don't already have a blobSha (resumable skip)
  const pendingChunks = rawChunks.filter((c) => !session!.blobShas[c.index]);
  const alreadyDone = totalChunks - pendingChunks.length;
  if (alreadyDone > 0) {
    console.info(`[upload] skipping ${alreadyDone}/${totalChunks} chunks (already uploaded in previous session)`);
  }

  // Pre-initialize blobShas to avoid ReferenceError in progress closure (Temporal Dead Zone)
  const blobShas = new Array<string>(totalChunks).fill("");

  await streamingUpload(pendingChunks, resolvedRepo, xhrMode, signal, async (chunkIndex, sent, _total) => {
    const prevSent = chunkSentBytes[chunkIndex];
    const delta = sent - prevSent;
    chunkSentBytes[chunkIndex] = sent;

    // Detect chunk completion
    const wasComplete = prevSent >= (rawChunks[chunkIndex]?.byteLength ?? 0);
    const isNowComplete = sent >= (rawChunks[chunkIndex]?.byteLength ?? 0);
    if (!wasComplete && isNowComplete) completedChunks++;

    // Aggregate bytes sent across all chunks
    const totalSent = chunkSentBytes.reduce((s, b) => s + b, 0);

    // Rolling speed window (last 5 events)
    if (delta > 0) {
      const nowMs = Date.now();
      speedSamples.push({ bytes: delta, ms: nowMs });
      if (speedSamples.length > 5) speedSamples.shift();
    }

    let speedMbps: number | undefined;
    let etaSeconds: number | undefined;
    if (speedSamples.length >= 2) {
      const windowMs = Date.now() - speedSamples[0].ms;
      const windowBytes = speedSamples.reduce((s, x) => s + x.bytes, 0);
      if (windowMs > 100) {
        speedMbps = Math.round((windowBytes / (1024 * 1024)) / (windowMs / 1000) * 10) / 10;
        const remaining = fileSize - totalSent;
        etaSeconds = speedMbps > 0 ? Math.round(remaining / (1024 * 1024) / speedMbps) : undefined;
      }
    }

    report("uploading", "uploading", totalSent, completedChunks, speedMbps, etaSeconds, chunkIndex);

    // Persist chunk completion to IndexedDB when the chunk finishes
    const chunkByteLength = rawChunks.find((c) => c.index === chunkIndex)?.byteLength ?? 0;
    if (sent >= chunkByteLength && session) {
      const sha = blobShas[chunkIndex]; // may not be set yet at progress time
      if (sha) {
        persistChunkBlobSha(session.sessionId, chunkIndex, sha).catch(console.warn);
      }
    }
  }, blobShas);

  console.info(`[upload] blobs done in ${((Date.now() - uploadStartMs) / 1000).toFixed(1)}s`);

  // Merge blobShas: combine newly uploaded with any pre-existing from resumed session
  const finalBlobShas = rawChunks.map((c) =>
    blobShas[c.index] || session?.blobShas[c.index] || ""
  );

  if (session) {
    await markUploaded(session.sessionId).catch(console.warn);
  }

  // For chunked uploads: finalize with a single commit covering all blobs
  if (uploadMode === "chunked" && finalBlobShas.some(Boolean)) {
    if (session) await markFinalizing(session.sessionId).catch(console.warn);
    report("finalizing", "indexing", fileSize, totalChunks);
    const finalizeStart = Date.now();
    try {
      const { commitSha } = await finalizeUploadWithResult(resolvedRepo, rawChunks, finalBlobShas, signal);
      console.info(`[upload] finalized in ${((Date.now() - finalizeStart) / 1000).toFixed(1)}s (1 commit for ${totalChunks} chunks)`);
      if (session) {
        await markCommitted(session.sessionId, commitSha).catch(console.warn);
        await markCompleted(session.sessionId).catch(console.warn);
      }
    } catch (err) {
      if (session) await markFailed(session.sessionId, String(err)).catch(console.warn);
      throw err;
    }
  }

  report("finalizing", "indexing", fileSize, totalChunks);

  return {
    hash: uploadKey, contentHash: shortHash, checksum: fullHex,
    path: basePath, nodeName: resolvedNode, nodeRepo: resolvedRepo,
    thumbnail, folder,
    chunks: rawChunks.map((c) => c.path),
    skipped: false, fixedEncoding: true, resolvedName,
    uploadMode, chunkSize, uploadVersion: UPLOAD_VERSION,
  };
}
