/**
 * lib/upload.ts
 * Browser-side upload pipeline:
 *   1. Compute SHA-256 hash (deduplication key)
 *   2. Check L1/L2 cache for hash — skip if duplicate
 *   3. Chunk large files (>4 MB) with File.slice()
 *   4. Compress text-based chunks with CompressionStream
 *   5. Base64 encode
 *   6. Upload in parallel batches of 4 via Next.js API route
 */

import type { UploadChunk, UploadProgress } from "@/types";
import { l1GetIndex } from "./cache";
import { classifyFile, ensureNodeExists, type NodeId } from "./nodes";

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

// Text MIME types that benefit from compression
const COMPRESSIBLE_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
];

function isCompressible(mimeType: string): boolean {
  return COMPRESSIBLE_TYPES.some((t) => mimeType.startsWith(t));
}

// ─── Hash ───────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a File using Web Crypto API.
 * Returns first 12 hex characters (6 bytes) as the dedup key.
 */
export async function getFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const full = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return full.slice(0, 12); // first 12 hex chars = 6 bytes
}

/**
 * Creates a unique index key by combining content hash with filename.
 * This allows the same file content to be stored multiple times under
 * different names, each as a separate record.
 */
async function generateRecordKey(
  contentHash: string,
  fileName: string
): Promise<string> {
  const input = `${contentHash}:${fileName}`;
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

// ─── Deduplication ──────────────────────────────────────────────────────

/**
 * Returns true if the hash already exists in any available cache layer,
 * falling back from L1 (in-memory) → L2 (IndexedDB) → server.
 * Must be awaited — use `if (await isDuplicateByHashAndName(recordKey))` at the call site.
 */
export async function isDuplicateByHashAndName(recordKey: string): Promise<boolean> {
  // L1 — fastest, available immediately after first load
  const l1 = l1GetIndex();
  if (l1) return recordKey in l1.files;

  // L2 — IndexedDB, survives page refresh
  const { l2GetIndex } = await import("./cache");
  const l2 = await l2GetIndex();
  if (l2) return recordKey in l2.files;

  // Neither cache available — check server as last resort
  try {
    const res = await fetch(`/api/files?hash=${encodeURIComponent(recordKey)}`);
    if (res.ok) {
      const data = (await res.json()) as { files?: Array<{ hash: string }> };
      return (data.files ?? []).some((f) => f.hash === recordKey);
    }
  } catch {
    // Network error — assume not duplicate, let upload proceed
  }

  return false;
}

// ─── Chunking ────────────────────────────────────────────────────────────

interface RawChunk {
  index: number;
  blob: Blob;
}

function sliceFile(file: File): RawChunk[] {
  const chunks: RawChunk[] = [];
  let offset = 0;
  let index = 0;
  while (offset < file.size) {
    chunks.push({ index, blob: file.slice(offset, offset + CHUNK_SIZE) });
    offset += CHUNK_SIZE;
    index++;
  }
  return chunks;
}

// ─── Compression ─────────────────────────────────────────────────────────

async function compressBlob(blob: Blob): Promise<Blob> {
  try {
    const stream = blob.stream() as unknown as ReadableStream<Uint8Array>;
    type CompressionCtor = new (format: "gzip") => TransformStream<Uint8Array, Uint8Array>;
    const Compression = (globalThis as unknown as { CompressionStream?: CompressionCtor }).CompressionStream;
    if (!Compression) throw new Error("CompressionStream unavailable");
    const compressed = stream.pipeThrough(new Compression("gzip"));
    const response = new Response(compressed);
    return await response.blob();
  } catch {
    // CompressionStream not available (some environments) — return as-is
    return blob;
  }
}

// Converts a Blob to a base64 string suitable for the GitHub Contents API.
// FileReader.readAsDataURL handles binary data correctly across all browsers
// and avoids the btoa() call-stack overflow on large chunks.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:application/octet-stream;base64,<base64data>"
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("FileReader: missing comma in data URL"));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}



export async function generateThumbnail(blob: Blob): Promise<string | null> {
  if (blob.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = Math.min(200 / bitmap.width, 150 / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 200, 150);
    ctx.drawImage(bitmap, (200 - w) / 2, (150 - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.6);
  }

  if (blob.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = URL.createObjectURL(blob);
      video.onloadeddata = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 150;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(video.src);
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, 200, 150);
        URL.revokeObjectURL(video.src);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(null);
      };
      try {
        video.currentTime = 1;
      } catch {
        // Ignore seek errors for short videos.
      }
    });
  }

  return null;
}

// ─── Prepare chunks ───────────────────────────────────────────────────────

export async function prepareChunks(
  file: File,
  basePath: string,
  hash: string
): Promise<UploadChunk[]> {
  if (!hash) {
    throw new Error("Missing file hash for chunk preparation");
  }

  const rawChunks = sliceFile(file);
  const compress = isCompressible(file.type);
  const isSingleChunk = rawChunks.length === 1;

  const prepared: UploadChunk[] = [];

  for (const raw of rawChunks) {
    let processedBlob = raw.blob;

    if (compress) {
      processedBlob = await compressBlob(processedBlob);
    }

    // Encode to base64 once here — this is the single encoding point for the pipeline
    const base64Content = await blobToBase64(processedBlob);
    // Keep date prefix so chunks/{hash} dirs are scoped per month inside the shared repo
    const datePrefix = basePath.split("/").slice(0, 2).join("/");
    const chunkPath = isSingleChunk
      ? basePath
      : `${datePrefix}/chunks/${hash}/${String(raw.index).padStart(5, "0")}`;

    prepared.push({ index: raw.index, data: base64Content, path: chunkPath });
  }

  return prepared;
}

// ─── Upload batching ──────────────────────────────────────────────────────

const BATCH_SIZE = 4;

export async function uploadChunksBatched(
  chunks: UploadChunk[],
  nodeRepo: string,
  onProgress?: (uploaded: number) => void
): Promise<void> {
  let uploaded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (chunk) => {
        // chunk.data is already a single-encoded base64 string from prepareChunks
        const res = await fetch("/api/upload/chunk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: nodeRepo,
            path: chunk.path,
            content: chunk.data,
            sha: chunk.sha,
          }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
          throw new Error(
            `Chunk upload failed (${chunk.path}): ${error.error}`
          );
        }

        uploaded++;
        onProgress?.(uploaded);
      })
    );
  }
}

// ─── Full pipeline ────────────────────────────────────────────────────────

export interface UploadPipelineOptions {
  file: File;
  nodeRepo?: string;
  nodeName?: string;
  userOverride?: string;
  sessionCsrfToken?: string;
  /** Single target folder path (e.g. "Trips/Japan"), or "/" for root */
  folder?: string;
  tags?: string[];
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadPipelineResult {
  hash: string;
  contentHash?: string;
  path: string;
  nodeName: string;
  nodeRepo: string;
  thumbnail: string | null;
  /** Resolved folder path — same value that was passed in or "/" */
  folder: string;
  chunks: string[];
  skipped: boolean; // true = dedup, no upload performed
  fixedEncoding?: boolean;
}

export async function runUploadPipeline(
  options: UploadPipelineOptions
): Promise<UploadPipelineResult> {
  const {
    file,
    nodeRepo,
    nodeName,
    userOverride,
    sessionCsrfToken,
    folder = "/",
    onProgress,
  } = options;

  const reportProgress = (
    status: UploadProgress["status"],
    uploadedChunks = 0,
    totalChunks = 1
  ) => {
    onProgress?.({
      fileId: "",
      filename: file.name,
      totalChunks,
      uploadedChunks,
      status,
    });
  };

  // Step 1: Hash
  reportProgress("hashing");
  const hash = await getFileHash(file);
  const recordKey = await generateRecordKey(hash, file.name);

  // Step 2: Dedup check
  reportProgress("dedup");
  if (await isDuplicateByHashAndName(recordKey)) {
    reportProgress("done", 1, 1);
    return {
      hash: recordKey,
      contentHash: hash,
      path: "",
      nodeName: nodeName ?? "other",
      nodeRepo: nodeRepo ?? "gitstore-other",
      thumbnail: null,
      folder,
      chunks: [],
      skipped: true,
    };
  }

  const index = l1GetIndex();
  const autoNode = classifyFile(file.type || "application/octet-stream");
  const targetNode = (userOverride ?? nodeName ?? autoNode) as NodeId;

  if (index && !ensureNodeExists(index, targetNode)) {
    await fetch("/api/nodes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCsrfToken ? { "x-csrf-token": sessionCsrfToken } : {}),
      },
      body: JSON.stringify({ name: targetNode }),
    });
  }

  const resolvedNode = nodeName ?? targetNode;

  const targetResponse = await fetch("/api/upload/target", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionCsrfToken ? { "x-csrf-token": sessionCsrfToken } : {}),
    },
    body: JSON.stringify({ nodeId: resolvedNode }),
  });

  if (!targetResponse.ok) {
    const error = await targetResponse.json().catch(() => ({ error: "Failed to resolve upload target" }));
    throw new Error(error.error ?? "Failed to resolve upload target");
  }

  const targetPayload = (await targetResponse.json()) as { repo: string };
  const resolvedRepo = targetPayload.repo ?? nodeRepo ?? index?.nodes[targetNode]?.repo ?? `gitstore-${targetNode}`;

  const thumbnail = await generateThumbnail(file);

  // Step 3 & 4 & 5: Slice, compress, base64
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const safeName = file.name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "") || "file";
  const basePath = `${year}/${month}/${recordKey}_${safeName}`;

  const chunks = await prepareChunks(file, basePath, hash);
  reportProgress("uploading", 0, chunks.length);

  // Step 6: Upload in batches of 4
  await uploadChunksBatched(chunks, resolvedRepo, (n) => {
    reportProgress("uploading", n, chunks.length);
  });

  reportProgress("indexing", chunks.length, chunks.length);

  const chunkPaths = chunks.map((c) => c.path);

  return {
    hash: recordKey,
    contentHash: hash,
    path: basePath,
    nodeName: resolvedNode,
    nodeRepo: resolvedRepo,
    thumbnail,
    folder,
    chunks: chunkPaths,
    skipped: false,
    fixedEncoding: true,
  };
}
