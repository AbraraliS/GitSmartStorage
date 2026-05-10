"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  XIcon,
} from "lucide-react";
import type { FileRecord } from "@/types";
import { formatBytes } from "@/lib/format";
import {
  createObjectUrl,
  detectPreviewType,
  fetchFileBlob,
  getDownloadUrl,
  getShikiLanguage,
  highlightCode,
  isBinaryContent,
  readBlobAsArrayBuffer,
  readBlobText,
  revokePreviewUrl,
} from "@/lib/preview";

import { SafePreviewBoundary } from "./SafePreviewBoundary";
import { ImagePreview } from "./ImagePreview";
import { VideoPreview } from "./VideoPreview";
import { AudioPreview } from "./AudioPreview";
import { PdfCanvasViewer } from "./PdfCanvasViewer";
import { DocxPreview } from "./DocxPreview";
import { XlsxPreview } from "./XlsxPreview";
import { PptxPreview } from "./PptxPreview";
import { CodePreview } from "./CodePreview";
import { TextPreview } from "./TextPreview";
import { ArchivePreview } from "./ArchivePreview";
import { UnsupportedPreview } from "./UnsupportedPreview";

interface PreviewModalProps {
  files: FileRecord[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * Blob architecture — one strategy per preview type:
 *
 *  image | video | audio | archive | unsupported
 *    blob → createObjectUrl(blob) → <img|video|audio src={url}>
 *    objectUrl revoked in prevMediaUrlRef cleanup
 *
 *  text | code | markdown
 *    blob → blob.text() → string
 *    Binary guard: isBinaryContent() checked first
 *    No objectUrl created; no fetch(objectUrl)
 *
 *  pdf
 *    blob → blob.arrayBuffer() → PdfCanvasViewer (pdf.js canvas)
 *    No objectUrl; no iframe
 *
 *  office-docx
 *    blob → blob.arrayBuffer() → DocxPreview (mammoth)
 *
 *  office-xlsx
 *    blob → blob.arrayBuffer() → XlsxPreview (SheetJS)
 *
 *  office-pptx
 *    PptxPreview (metadata card + download; no parse needed)
 */
interface LoadedState {
  blob: Blob;
  mimeType: string;
  mediaObjectUrl: string | null;   // for image/video/audio/archive/unsupported
  textContent: string | null;      // for text/code/markdown
  codeHtml: string | null;         // for code
  truncated: boolean;
  binaryDetected: boolean;         // true if text decode was aborted
  arrayBuffer: ArrayBuffer | null; // for pdf/docx/xlsx
}

export function PreviewModal({
  files,
  currentIndex,
  onClose,
  onNavigate,
}: PreviewModalProps) {
  const file = files[currentIndex];
  const [state, setState] = useState<LoadedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [corrupted, setCorrupted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const prevMediaUrlRef = useRef<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;

    const controller = new AbortController();
    let alive = true;

    setLoading(true);
    setError(null);
    setState(null);
    setCorrupted(false);

    // Revoke previous media object URL immediately
    if (prevMediaUrlRef.current) {
      revokePreviewUrl(prevMediaUrlRef.current);
      prevMediaUrlRef.current = null;
    }

    const run = async () => {
      try {
        const result = await fetchFileBlob(file, controller.signal);
        if (!alive) return;

        if ("corrupted" in result) {
          setCorrupted(true);
          setLoading(false);
          return;
        }

        const { blob, mimeType } = result;
        const previewType = detectPreviewType(file);

        let mediaObjectUrl: string | null = null;
        let textContent: string | null = null;
        let codeHtml: string | null = null;
        let truncated = false;
        let binaryDetected = false;
        let arrayBuffer: ArrayBuffer | null = null;

        switch (previewType) {
          // ── Media: objectUrl for DOM src ──────────────────────────────
          case "image":
          case "video":
          case "audio":
          case "archive":
          case "unsupported": {
            mediaObjectUrl = createObjectUrl(blob);
            prevMediaUrlRef.current = mediaObjectUrl;
            break;
          }

          // ── Text: read directly from Blob — NO fetch(objectUrl) ───────
          case "text":
          case "code":
          case "markdown": {
            // Guard against binary data masquerading as text
            const binary = await isBinaryContent(blob);
            if (!alive) return;
            if (binary) {
              // Treat as unsupported binary
              binaryDetected = true;
              mediaObjectUrl = createObjectUrl(blob);
              prevMediaUrlRef.current = mediaObjectUrl;
            } else {
              const { text, truncated: wasTrunc } = await readBlobText(blob);
              if (!alive) return;
              textContent = text;
              truncated = wasTrunc;
              if (previewType === "code") {
                const lang = getShikiLanguage(file) ?? "text";
                const html = await highlightCode(text, lang);
                if (alive) codeHtml = html;
              }
            }
            break;
          }

          // ── PDF / Office: arrayBuffer — NO objectUrl, NO fetch(blobUrl)
          case "pdf":
          case "office-docx":
          case "office-xlsx": {
            arrayBuffer = await readBlobAsArrayBuffer(blob);
            if (!alive) return;
            break;
          }

          // ── PPTX: metadata only, no parsing needed ────────────────────
          case "office-pptx": {
            // No parse needed — PptxPreview shows metadata card
            break;
          }
        }

        if (!alive) return;
        setState({
          blob,
          mimeType,
          mediaObjectUrl,
          textContent,
          codeHtml,
          truncated,
          binaryDetected,
          arrayBuffer,
        });
      } catch (err) {
        if (!alive) return;
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.hash, retryKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevMediaUrlRef.current) {
        revokePreviewUrl(prevMediaUrlRef.current);
        prevMediaUrlRef.current = null;
      }
    };
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < files.length - 1) onNavigate(currentIndex + 1);
      if (e.key === " " && mediaRef.current) {
        e.preventDefault();
        const m = mediaRef.current;
        if (m.paused) void m.play(); else m.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, files.length, onClose, onNavigate]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/files?hash=${encodeURIComponent(file.hash)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      onClose();
      window.dispatchEvent(new Event("gitstore:refresh-index"));
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  if (!file) return null;

  const previewType = detectPreviewType(file);
  const downloadUrl = getDownloadUrl(file.hash);

  // ── Renderer ──────────────────────────────────────────────────────────────
  const renderContent = () => {
    if (!state) return null;
    const { mediaObjectUrl, textContent, codeHtml, truncated, arrayBuffer, binaryDetected } = state;

    return (
      <SafePreviewBoundary fileName={file.name} downloadUrl={downloadUrl} onRetry={retry}>
        {/* Binary detected masquerading as text → treat as unsupported */}
        {binaryDetected && (
          <UnsupportedPreview file={file} objectUrl={mediaObjectUrl} downloadUrl={downloadUrl} />
        )}

        {!binaryDetected && previewType === "image" && mediaObjectUrl && (
          <ImagePreview src={mediaObjectUrl} alt={file.name} />
        )}
        {!binaryDetected && previewType === "video" && mediaObjectUrl && (
          <VideoPreview src={mediaObjectUrl} fileName={file.name} />
        )}
        {!binaryDetected && previewType === "audio" && mediaObjectUrl && (
          <AudioPreview src={mediaObjectUrl} fileName={file.name} fileSize={file.size} />
        )}
        {!binaryDetected && previewType === "pdf" && arrayBuffer && (
          <PdfCanvasViewer
            pdfData={arrayBuffer}
            fileName={file.name}
            downloadUrl={downloadUrl}
          />
        )}
        {!binaryDetected && previewType === "office-docx" && arrayBuffer && (
          <DocxPreview
            arrayBuffer={arrayBuffer}
            fileName={file.name}
            downloadUrl={downloadUrl}
          />
        )}
        {!binaryDetected && previewType === "office-xlsx" && arrayBuffer && (
          <XlsxPreview
            arrayBuffer={arrayBuffer}
            fileName={file.name}
            downloadUrl={downloadUrl}
          />
        )}
        {!binaryDetected && previewType === "office-pptx" && (
          <PptxPreview file={file} downloadUrl={downloadUrl} />
        )}
        {!binaryDetected && previewType === "code" && textContent !== null && (
          <CodePreview
            text={textContent}
            codeHtml={codeHtml}
            fileName={file.name}
            language={getShikiLanguage(file)}
            truncated={truncated}
          />
        )}
        {!binaryDetected && previewType === "markdown" && textContent !== null && (
          <TextPreview text={textContent} isMarkdown fileName={file.name} truncated={truncated} />
        )}
        {!binaryDetected && previewType === "text" && textContent !== null && (
          <TextPreview text={textContent} isMarkdown={false} fileName={file.name} truncated={truncated} />
        )}
        {!binaryDetected && previewType === "archive" && mediaObjectUrl && (
          <ArchivePreview file={file} objectUrl={mediaObjectUrl} />
        )}
        {!binaryDetected && previewType === "unsupported" && (
          <UnsupportedPreview file={file} objectUrl={mediaObjectUrl} downloadUrl={downloadUrl} />
        )}
      </SafePreviewBoundary>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-gray-950/80 px-2 py-2 backdrop-blur md:px-4 md:py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Back/close button — behaves as back on mobile, X on desktop */}
          <button
            type="button"
            onClick={onClose}
            className="touch-target shrink-0 rounded-xl text-gray-400 hover:bg-white/10 hover:text-gray-100 transition"
            aria-label="Close preview"
          >
            <ArrowLeftIcon className="h-5 w-5 md:hidden" />
            <XIcon className="hidden h-4 w-4 md:block" />
          </button>
          <FileIcon className="hidden h-4 w-4 shrink-0 text-gray-400 md:block" />
          <p className="truncate text-sm font-medium text-gray-100">{file.name}</p>
          <span className="hidden text-xs text-gray-500 md:inline">{formatBytes(file.size)}</span>
          {state && (
            <span className="hidden rounded bg-gray-800 px-1.5 py-0.5 text-[10px] uppercase text-gray-400 md:inline">
              {previewType.replace("office-", "")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={downloadUrl}
            download={file.name}
            className="touch-target rounded-xl text-gray-400 hover:bg-white/10 hover:text-gray-100 transition"
            aria-label="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </a>
          {files.length > 1 && (
            <span className="px-2 text-xs text-gray-600">
              {currentIndex + 1} / {files.length}
            </span>
          )}
          {/* Desktop close button — hidden on mobile (top-left ArrowLeft used instead) */}
          <button
            type="button"
            onClick={onClose}
            className="touch-target hidden rounded-xl text-gray-400 hover:bg-white/10 hover:text-gray-100 transition md:flex"
            aria-label="Close preview"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Prev ─────────────────────────────────────────────────────── */}
      {files.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition"
          aria-label="Previous file"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      )}

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-64 w-64 animate-pulse rounded-xl bg-gray-800" />
            <p className="animate-pulse text-xs text-gray-600">Loading preview…</p>
          </div>
        )}

        {!loading && corrupted && (
          <div className="flex max-w-sm flex-col items-center gap-5 rounded-2xl border border-amber-800/40 bg-gray-900 px-10 py-12 text-center">
            <div className="rounded-full bg-amber-500/10 p-4">
              <AlertTriangleIcon className="h-10 w-10 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-amber-300">File is corrupted</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                This file was uploaded before a bug fix and cannot be recovered.
                Delete it and re-upload the original file.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800">
                Close
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete file"}
              </button>
            </div>
          </div>
        )}

        {!loading && error && !corrupted && (
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <AlertTriangleIcon className="h-10 w-10 text-red-400" />
            <div>
              <p className="font-medium text-red-400">Preview failed</p>
              <p className="mt-1 text-xs text-gray-500 break-words">{error}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={retry} className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:bg-gray-800">
                Retry
              </button>
              <a href={downloadUrl} download={file.name} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">
                Download
              </a>
            </div>
          </div>
        )}

        {!loading && !error && !corrupted && renderContent()}
      </div>

      {/* ── Next ─────────────────────────────────────────────────────── */}
      {files.length > 1 && currentIndex < files.length - 1 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition"
          aria-label="Next file"
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
