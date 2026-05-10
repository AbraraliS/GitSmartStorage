/**
 * lib/pdf-worker.ts
 *
 * Configures the pdf.js web worker ONCE for the entire app.
 * Must be called before any pdf.js document load.
 *
 * Worker strategy:
 *   - The worker file is copied from node_modules to /public at install time
 *     (or via next.config.ts static serving) so it loads from the same origin.
 *   - This satisfies CSP: worker-src 'self' blob:
 *   - Using /pdf.worker.min.mjs (served from /public) avoids:
 *       * CDN dependency (works offline, works on Vercel, works in Brave)
 *       * MIME mismatch (served as application/javascript by Next.js)
 *       * unsafe-eval (pure worker, no eval needed)
 *       * chrome-extension:// lookups
 *
 * Usage:
 *   import { configurePdfWorker } from "@/lib/pdf-worker";
 *   configurePdfWorker();      // idempotent — safe to call multiple times
 */

let configured = false;

export async function configurePdfWorker(): Promise<void> {
  if (configured) return;
  configured = true;

  const pdfjsLib = await import("pdfjs-dist");

  // Only configure if not already set (respects any prior configuration)
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Serve the worker from /public — same origin, no CSP issues.
    // The worker file must be present at: public/pdf.worker.min.mjs
    // Copy command: cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}
