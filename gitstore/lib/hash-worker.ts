/**
 * lib/hash-worker.ts
 * Off-main-thread SHA-256 hashing via an inline Web Worker.
 *
 * Why inline (Blob URL) instead of a separate worker file:
 *   - No Next.js webpack worker-loader config needed
 *   - No separate file to maintain or bundle
 *   - Works in all modern browsers (Blob + Worker + crypto.subtle in workers)
 *
 * The worker receives a File object (structured-cloneable) and sends back:
 *   { type: "progress", processed, total }   — during large-file hashing
 *   { type: "done", shortHash, fullHex }     — when complete
 *   { type: "error", message }               — on failure
 *
 * Fallback: if Worker is unavailable (SSR, old browser) falls back to
 * main-thread hashing via getFileHash() from upload.ts.
 */

// ─── Worker source ────────────────────────────────────────────────────────────
// Written as a template string so it can be compiled into a Blob URL at runtime.
// Must be self-contained — no imports, no TypeScript, plain ES2020.

const WORKER_SOURCE = /* js */ `
const HASH_CHUNK = 64 * 1024 * 1024; // 64MB read slices

self.onmessage = async function(e) {
  if (e.data.type !== "hash") return;
  const file = e.data.file;

  try {
    if (file.size <= HASH_CHUNK) {
      const buf = await file.arrayBuffer();
      const h = await crypto.subtle.digest("SHA-256", buf);
      const hex = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2,"0")).join("");
      self.postMessage({ type: "done", shortHash: hex.slice(0, 12), fullHex: hex });
      return;
    }

    // Large file: hash 64MB slices, then hash their concatenation (merkle root).
    // This avoids a single giant ArrayBuffer allocation.
    const chunkHashes = [];
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + HASH_CHUNK);
      const buf = await slice.arrayBuffer();
      const h = await crypto.subtle.digest("SHA-256", buf);
      chunkHashes.push(new Uint8Array(h));
      offset += HASH_CHUNK;
      // Progress event so UI can show hashing %
      self.postMessage({ type: "progress", processed: Math.min(offset, file.size), total: file.size });
    }

    const combined = new Uint8Array(chunkHashes.reduce((n, h) => n + h.length, 0));
    let pos = 0;
    for (const h of chunkHashes) { combined.set(h, pos); pos += h.length; }
    const root = await crypto.subtle.digest("SHA-256", combined);
    const hex = [...new Uint8Array(root)].map(b => b.toString(16).padStart(2,"0")).join("");
    self.postMessage({ type: "done", shortHash: hex.slice(0, 12), fullHex: hex });
  } catch(err) {
    self.postMessage({ type: "error", message: err && err.message ? err.message : String(err) });
  }
};
`;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HashResult {
  shortHash: string; // first 12 hex chars — dedup key
  fullHex: string;   // full 64-char SHA-256 — stored as checksum
}

/**
 * Hash a File off the main thread using an inline Web Worker.
 *
 * Progress events allow the UI to show a real hashing percentage for
 * large files (important for 500MB+ uploads where hashing takes 5–15s).
 *
 * @param onProgress - called with (processedBytes, totalBytes) during hashing
 */
export function hashFileInWorker(
  file: File,
  onProgress?: (processed: number, total: number) => void
): Promise<HashResult> {
  return new Promise((resolve, reject) => {
    let workerUrl: string | null = null;
    let worker: Worker | null = null;

    try {
      const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
    } catch {
      // Worker creation failed (SSR or restricted env) — reject so caller falls back
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      reject(new Error("Worker unavailable"));
      return;
    }

    const cleanup = () => {
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    };

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "done"; shortHash: string; fullHex: string }
        | { type: "progress"; processed: number; total: number }
        | { type: "error"; message: string };

      if (msg.type === "done") {
        cleanup();
        resolve({ shortHash: msg.shortHash, fullHex: msg.fullHex });
      } else if (msg.type === "progress") {
        onProgress?.(msg.processed, msg.total);
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(`Hash worker error: ${msg.message}`));
      }
    };

    worker.onerror = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(`Hash worker onerror: ${e.message}`));
    };

    // Send the File — File is structured-cloneable (extends Blob)
    worker.postMessage({ type: "hash", file });
  });
}

/**
 * Hash a file, using a Web Worker if available, falling back to main thread.
 * Always use this instead of calling getFileHash() directly.
 */
export async function hashFile(
  file: File,
  onProgress?: (processed: number, total: number) => void
): Promise<HashResult> {
  if (typeof Worker === "undefined") {
    // SSR or browser without Worker support — fallback
    return hashFileMainThread(file);
  }

  try {
    return await hashFileInWorker(file, onProgress);
  } catch (err) {
    console.warn("[hash-worker] Worker failed, falling back to main thread:", err);
    return hashFileMainThread(file);
  }
}

// ─── Main-thread fallback ─────────────────────────────────────────────────────

const HASH_READ_CHUNK = 64 * 1024 * 1024;

async function hashFileMainThread(file: File): Promise<HashResult> {
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
  const root = await crypto.subtle.digest("SHA-256", combined);
  const hex = [...new Uint8Array(root)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { shortHash: hex.slice(0, 12), fullHex: hex };
}
