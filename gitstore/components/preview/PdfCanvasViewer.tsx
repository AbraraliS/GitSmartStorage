"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { configurePdfWorker } from "@/lib/pdf-worker";

interface PdfCanvasViewerProps {
  /** Raw ArrayBuffer of the PDF — read directly from Blob.arrayBuffer(), never from fetch(blobUrl) */
  pdfData: ArrayBuffer;
  fileName: string;
  downloadUrl: string;
}

/**
 * PdfCanvasViewer
 *
 * Renders PDFs using pdf.js onto an HTML canvas.
 * This approach is browser-agnostic and works correctly in:
 *   - Brave (no plugin lookup, no chrome-extension:// requests)
 *   - Chrome, Firefox, Safari, Edge
 *   - Mobile browsers
 *
 * Why canvas, not iframe:
 *   - <object>/<iframe> activate browser PDF plugins which generate
 *     chrome-extension:// requests in Brave → ERR_FAILED
 *   - Canvas rendering is pure JS with no plugin involvement
 *   - Full control over pagination, zoom, and rendering quality
 *
 * pdfData is an ArrayBuffer consumed directly by pdf.js.
 * No object URL is created for the PDF.
 */
export function PdfCanvasViewer({
  pdfData,
  fileName,
  downloadUrl,
}: PdfCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderLoading, setRenderLoading] = useState(true);

  // pdfDocRef holds the loaded PDFDocumentProxy across renders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);

  // ── Load PDF document once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setRenderLoading(true);
      setLoadError(null);

      try {
        // Configure the worker exactly once (idempotent)
        await configurePdfWorker();

        // Lazy-import pdf.js — only loaded when PDF preview is needed
        const pdfjsLib = await import("pdfjs-dist");

        // Pass a copy of the ArrayBuffer so pdf.js owns its memory.
        const data = pdfData.slice(0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const doc = await pdfjsLib.getDocument({ data }).promise;

        if (cancelled) return;

        pdfDocRef.current = doc;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        setTotalPages(doc.numPages as number);
        setCurrentPage(1);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load PDF"
          );
          setRenderLoading(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // ── Render current page ─────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (currentPage < 1 || (totalPages > 0 && currentPage > totalPages)) return;

    let cancelled = false;

    const render = async () => {
      setRenderLoading(true);

      // Cancel previous render task if still running
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const page = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        canvas.height = viewport.height as number;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        canvas.width = viewport.width as number;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task as { cancel: () => void };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await (task as { promise: Promise<void> }).promise;

        if (!cancelled) setRenderLoading(false);
      } catch (err) {
        // RenderingCancelledException is expected and safe to ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if ((err as { name?: string }).name === "RenderingCancelledException") return;
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Page render failed"
          );
          setRenderLoading(false);
        }
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [currentPage, scale, totalPages]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.2, 4.0)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.2, 0.4)), []);
  const prevPage = useCallback(() => setCurrentPage((p) => Math.max(p - 1, 1)), []);
  const nextPage = useCallback(
    () => setCurrentPage((p) => Math.min(p + 1, totalPages)),
    [totalPages]
  );

  if (loadError) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-red-900/30 bg-gray-900 px-8 py-10 text-center">
        <p className="font-semibold text-red-400">PDF load failed</p>
        <p className="text-xs text-gray-500">{loadError}</p>
        <a
          href={downloadUrl}
          download={fileName}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition"
        >
          <DownloadIcon className="h-4 w-4" />
          Download PDF
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/90 px-3 py-1.5 backdrop-blur text-sm text-gray-300">
        {/* Page navigation */}
        <button
          type="button"
          onClick={prevPage}
          disabled={currentPage <= 1}
          className="rounded p-1.5 hover:bg-gray-700 disabled:opacity-30 transition"
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="min-w-[70px] text-center text-xs">
          {totalPages > 0
            ? `${currentPage} / ${totalPages}`
            : "Loading…"}
        </span>
        <button
          type="button"
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="rounded p-1.5 hover:bg-gray-700 disabled:opacity-30 transition"
          aria-label="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-gray-700" />

        {/* Zoom */}
        <button
          type="button"
          onClick={zoomOut}
          className="rounded p-1.5 hover:bg-gray-700 transition"
          aria-label="Zoom out"
        >
          <ZoomOutIcon className="h-4 w-4" />
        </button>
        <span className="min-w-[42px] text-center text-xs">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded p-1.5 hover:bg-gray-700 transition"
          aria-label="Zoom in"
        >
          <ZoomInIcon className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-gray-700" />

        <a
          href={downloadUrl}
          download={fileName}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition"
          aria-label="Download PDF"
        >
          <DownloadIcon className="h-4 w-4" />
        </a>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────── */}
      <div
        className="relative overflow-auto rounded-xl border border-gray-800 bg-white shadow-xl"
        style={{ maxHeight: "78vh", maxWidth: "90vw" }}
      >
        {renderLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 z-10">
            <Loader2Icon className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        )}
        <canvas ref={canvasRef} className="block" />
      </div>

      {/* Keyboard hint */}
      {totalPages > 1 && (
        <p className="text-xs text-gray-600">
          ← → arrow keys to navigate pages
        </p>
      )}
    </div>
  );
}
