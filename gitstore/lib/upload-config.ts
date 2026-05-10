/**
 * lib/upload-config.ts
 *
 * Single source of truth for all upload pipeline thresholds and strategies.
 *
 * DO NOT hardcode any upload size values outside this file.
 *
 * Future: make concurrency adaptive based on navigator.hardwareConcurrency,
 * network speed estimation (navigator.connection), and GitHub rate-limit headers.
 */

// ─── File size thresholds ─────────────────────────────────────────────────────

/**
 * Files at or below this size are uploaded as a single request.
 * 80MB is the safe operational ceiling for GitHub Contents API, accounting
 * for base64 expansion (~33%) and request overhead. Do NOT raise to 100MB.
 */
export const SINGLE_UPLOAD_THRESHOLD = 80 * 1024 * 1024; // 80 MB

/**
 * Chunk size for huge files (500MB+).
 * 80MB maximises throughput while staying under the safe limit.
 */
export const MAX_SAFE_CHUNK_SIZE = 80 * 1024 * 1024; // 80 MB

/**
 * Minimum chunk size — never slice smaller than this for chunked uploads.
 * Prevents excessive chunk count / API call overhead for medium files.
 */
export const MIN_CHUNK_SIZE = 32 * 1024 * 1024; // 32 MB

/**
 * Chunk size for medium files (80MB – 500MB). Kept for documentation/future use.
 * Currently unused — all chunked uploads use MAX_SAFE_CHUNK_SIZE.
 */
export const MEDIUM_CHUNK_SIZE = 80 * 1024 * 1024; // unified to 80MB

// ─── Concurrency ──────────────────────────────────────────────────────────────

/**
 * Maximum number of chunk requests in-flight simultaneously.
 * 2 is the safe default: each 80MB chunk = ~106MB base64 in memory.
 * 3 parallel × 106MB = 318MB peak RAM — too aggressive for most browsers.
 * Future: adapt dynamically based on navigator.deviceMemory.
 */
export const MAX_PARALLEL_UPLOADS = 2;

// ─── Retry ────────────────────────────────────────────────────────────────────

export const MAX_CHUNK_RETRIES = 3;

/** Base delay in ms for exponential back-off: delay = BASE_RETRY_DELAY_MS * 2^attempt */
export const BASE_RETRY_DELAY_MS = 1000;

/** Random jitter (ms) added per chunk to prevent simultaneous retry storms */
export const CHUNK_JITTER_MS = 300;

// ─── Versioning ───────────────────────────────────────────────────────────────

/** Increment when the upload pipeline changes in a way that affects downloads */
export const UPLOAD_VERSION = 2;

// ─── Strategy selectors ───────────────────────────────────────────────────────

export type UploadMode = "single" | "chunked" | "legacy";

/**
 * Select the upload mode for a given file size.
 *
 *  ≤ 80MB   → single   (one API call, no splitting)
 *  > 80MB   → chunked  (adaptive slice + parallel uploads)
 */
export function selectUploadMode(fileSizeBytes: number): UploadMode {
  return fileSizeBytes <= SINGLE_UPLOAD_THRESHOLD ? "single" : "chunked";
}

/**
 * Adaptive chunk size selector.
 *
 * All chunked uploads (files > SINGLE_UPLOAD_THRESHOLD) use 80MB chunks.
 * This gives:
 *   351MB → 5 chunks (80+80+80+80+31)
 *   500MB → 7 chunks (80×6+20)
 *   1GB   → 13 chunks
 *
 * Why NOT different sizes for medium vs huge:
 * - Smaller chunks (50MB) increase commit count and API call overhead
 * - 80MB is the safe GitHub ceiling — use it uniformly for simplicity
 * - The body size limit in the API route supports 150MB (for base64 expansion)
 */
export function selectChunkSize(_fileSizeBytes: number): number {
  return MAX_SAFE_CHUNK_SIZE; // 80MB always
}

/**
 * Returns expected chunk count for a given file size (for UI pre-calculation).
 */
export function estimateChunkCount(fileSizeBytes: number): number {
  if (fileSizeBytes <= SINGLE_UPLOAD_THRESHOLD) return 1;
  const chunkSize = selectChunkSize(fileSizeBytes);
  return Math.ceil(fileSizeBytes / chunkSize);
}
