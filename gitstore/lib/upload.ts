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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compressed = stream.pipeThrough(new (globalThis as any).CompressionStream("gzip"));
    const response = new Response(compressed);
    return await response.blob();
  } catch {
    // CompressionStream not available (some environments) — return as-is
    return blob;
  }
}

// ─── Base64 encode ────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

// ─── Prepare chunks ───────────────────────────────────────────────────────

export async function prepareChunks(
  file: File,
  basePath: string,
  encryptionKey?: CryptoKey
): Promise<{ chunks: UploadChunk[]; ivs: string[] }> {
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

    const content = await blobToBase64(processedBlob);

    const chunkPath = isSingleChunk
      ? basePath
      : `${basePath}.chunks/${String(raw.index).padStart(4, "0")}`;

    prepared.push({ index: raw.index, data: content, path: chunkPath, iv: chunkIv });
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
          const error = await res.json().catch(() => ({ error: "Unknown error" }));
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
  nodeRepo: string;
  nodeName: string;
  tags?: string[];
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadPipelineResult {
  hash: string;
  path: string;
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
  const { file, nodeRepo, nodeName, tags = [], onProgress } = options;

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
    return { hash, path: "", chunks: [], skipped: true };
  }

  // Step 3 & 4 & 5: Slice, compress, [encrypt], base64
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const basePath = `${year}/${month}/${hash}_${file.name}`;

  // Generate a per-file AES-256-GCM key for client-side encryption
  const fileKey = ENCRYPTION_ENABLED ? await generateFileKey() : undefined;

  const { chunks, ivs } = await prepareChunks(file, basePath, fileKey);
  reportProgress("uploading", 0, chunks.length);

  // Step 6: Upload in batches of 4
  await uploadChunksBatched(chunks, nodeRepo, (n) => {
    reportProgress("uploading", n, chunks.length);
  });

  reportProgress("indexing", chunks.length, chunks.length);

  const chunkPaths = chunks.map((c) => c.path);

  // Export encryption key so it can be stored in the (private) FileRecord
  const encryptionKey = fileKey ? await exportKeyToBase64(fileKey) : undefined;

  return {
    hash,
    path: basePath,
    chunks: chunkPaths,
    skipped: false,
    iv: ivs.length > 0 ? ivs.join(":") : undefined,
    encryptionKey,
  };
}
