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

// ─── Deduplication ──────────────────────────────────────────────────────

/**
 * Returns true if the hash already exists in the L1 in-memory index.
 * Caller should then skip the upload entirely.
 */
export function isDuplicate(hash: string): boolean {
  const index = l1GetIndex();
  if (!index) return false;
  return hash in index.files;
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

// Use chunked approach to avoid call-stack overflow on large files
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out.buffer;
}

// ─── AES-256-GCM encryption ───────────────────────────────────────────────

/** Whether client-side encryption is enabled (always true in production). */
export const ENCRYPTION_ENABLED = true;

/**
 * Generate a new AES-256-GCM CryptoKey for a single file upload.
 * The key is non-extractable by default; pass extractable=true to export it afterward.
 */
export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can export and store alongside the file record
    ["encrypt", "decrypt"]
  );
}

/** Export a CryptoKey to a base64 string for storage in the FileRecord. */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const bytes = new Uint8Array(raw);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Encrypt a Blob with AES-256-GCM.
 * Returns the ciphertext as a new Blob and the 12-byte IV encoded as base64.
 */
async function encryptBlob(
  blob: Blob,
  key: CryptoKey
): Promise<{ encrypted: Blob; iv: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const plaintext = await blob.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    plaintext
  );
  // Base64-encode the IV for storage in the FileRecord
  let ivBinary = "";
  for (let i = 0; i < ivBytes.byteLength; i++) {
    ivBinary += String.fromCharCode(ivBytes[i]);
  }
  return {
    encrypted: new Blob([ciphertext]),
    iv: btoa(ivBinary),
  };
}

async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

export async function decryptChunk(
  encryptedBuffer: ArrayBuffer,
  base64Iv: string,
  base64Key: string
): Promise<ArrayBuffer> {
  const key = await importKeyFromBase64(base64Key);
  const iv = new Uint8Array(base64ToArrayBuffer(base64Iv));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedBuffer);
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
  hash: string,
  encryptionKey?: CryptoKey
): Promise<{ chunks: UploadChunk[]; ivs: string[] }> {
  if (!hash) {
    throw new Error("Missing file hash for chunk preparation");
  }

  const rawChunks = sliceFile(file);
  const compress = isCompressible(file.type);
  const isSingleChunk = rawChunks.length === 1;

  const prepared: UploadChunk[] = [];
  const ivs: string[] = [];

  for (const raw of rawChunks) {
    let processedBlob = raw.blob;

    if (compress) {
      processedBlob = await compressBlob(processedBlob);
    }

    // Encrypt if a key is provided (client-side AES-256-GCM)
    let chunkIv: string | undefined;
    if (encryptionKey && ENCRYPTION_ENABLED) {
      const { encrypted, iv } = await encryptBlob(processedBlob, encryptionKey);
      processedBlob = encrypted;
      chunkIv = iv;
      ivs.push(iv);
    }

    // Extract raw bytes — base64 encoding happens once in uploadChunksBatched
    const rawBytes = new Uint8Array(await processedBlob.arrayBuffer());
    // Keep date prefix so chunks/{hash} dirs are scoped per month inside the shared repo
    const datePrefix = basePath.split("/").slice(0, 2).join("/");
    const chunkPath = isSingleChunk
      ? basePath
      : `${datePrefix}/chunks/${hash}/${String(raw.index).padStart(5, "0")}`;

    prepared.push({ index: raw.index, data: rawBytes, path: chunkPath, iv: chunkIv });
  }

  return { chunks: prepared, ivs };
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
        // Encode raw bytes to base64 here — this is the single encoding point
        const base64Content = uint8ArrayToBase64(chunk.data);

        const res = await fetch("/api/upload/chunk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: nodeRepo,
            path: chunk.path,
            content: base64Content,
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
  path: string;
  nodeName: string;
  nodeRepo: string;
  thumbnail: string | null;
  /** Resolved folder path — same value that was passed in or "/" */
  folder: string;
  chunks: string[];
  skipped: boolean; // true = dedup, no upload performed
  /** Base64-encoded 12-byte AES-GCM IVs (one per chunk), colon-separated */
  iv?: string;
  /** Base64-encoded 256-bit AES-GCM file key — store in (private) FileRecord */
  encryptionKey?: string;
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

  // Step 2: Dedup check
  reportProgress("dedup");
  if (isDuplicate(hash)) {
    reportProgress("done", 1, 1);
    return {
      hash,
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

  // Step 3 & 4 & 5: Slice, compress, [encrypt], base64
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const safeName = file.name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "") || "file";
  const basePath = `${year}/${month}/${hash}_${safeName}`;

  // Generate a per-file AES-256-GCM key for client-side encryption
  const fileKey = ENCRYPTION_ENABLED ? await generateFileKey() : undefined;

  const { chunks, ivs } = await prepareChunks(file, basePath, hash, fileKey);
  reportProgress("uploading", 0, chunks.length);

  // Step 6: Upload in batches of 4
  await uploadChunksBatched(chunks, resolvedRepo, (n) => {
    reportProgress("uploading", n, chunks.length);
  });

  reportProgress("indexing", chunks.length, chunks.length);

  const chunkPaths = chunks.map((c) => c.path);

  // Export encryption key so it can be stored in the (private) FileRecord
  const encryptionKey = fileKey ? await exportKeyToBase64(fileKey) : undefined;

  return {
    hash,
    path: basePath,
    nodeName: resolvedNode,
    nodeRepo: resolvedRepo,
    thumbnail,
    folder,
    chunks: chunkPaths,
    skipped: false,
    iv: ivs.length > 0 ? ivs.join(":") : undefined,
    encryptionKey,
  };
}
