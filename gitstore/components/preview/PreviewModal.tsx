"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  MusicIcon,
  XIcon,
} from "lucide-react";
import type { FileRecord } from "@/types";
import { formatBytes } from "@/lib/format";

interface PreviewModalProps {
  files: FileRecord[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function extensionFromName(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop() ?? "txt" : "txt";
}

function getMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
    pdf: "application/pdf",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
    txt: "text/plain", md: "text/markdown", json: "application/json",
    js: "text/javascript", ts: "text/typescript", tsx: "text/typescript",
    jsx: "text/javascript", html: "text/html", css: "text/css",
    xml: "application/xml", py: "text/x-python", sql: "text/x-sql",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return map[ext] ?? "application/octet-stream";
}

export function PreviewModal({
  files,
  currentIndex,
  onClose,
  onNavigate,
}: PreviewModalProps) {
  const file = files[currentIndex];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [textContent, setTextContent] = useState<string | null>(null);
  const [codeHtml, setCodeHtml] = useState<string | null>(null);
  const [isCorrupted, setIsCorrupted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  // Revoke old object URL when file changes
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.hash]);

  useEffect(() => {
    if (!file) return;

    let active = true;
    let createdUrl: string | null = null;

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    setMimeType("");
    setTextContent(null);
    setCodeHtml(null);
    setIsCorrupted(false);
    setDeleting(false);

    const load = async () => {
      try {
        const res = await fetch(
          `/api/files/download?hash=${encodeURIComponent(file.hash)}`
        );

        if (res.status === 422) {
          // Corrupted file — uploaded before encoding fix, cannot be recovered
          if (active) {
            setIsCorrupted(true);
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          let errMsg = `Server error ${res.status}`;
          try {
            const json = (await res.json()) as { error?: string };
            if (json.error) errMsg = json.error;
          } catch {
            // ignore
          }
          throw new Error(errMsg);
        }

        const buffer = await res.arrayBuffer();
        if (!active) return;

        // Server returns plaintext — create blob directly
        const resolved =
          file.type && file.type !== "application/octet-stream"
            ? file.type
            : getMimeFromName(file.name);
        setMimeType(resolved);

        const blob = new Blob([buffer], { type: resolved });
        createdUrl = URL.createObjectURL(blob);

        // Handle text-based files
        const isText =
          resolved.startsWith("text/") ||
          resolved.includes("json") ||
          resolved.includes("javascript") ||
          resolved.includes("typescript") ||
          resolved.includes("xml");

        if (isText) {
          const text = await blob.text();
          if (!active) return;
          setTextContent(text);

          const isMarkdown =
            resolved.includes("markdown") ||
            resolved.startsWith("text/markdown") ||
            file.name.endsWith(".md");

          if (!isMarkdown) {
            try {
              const { codeToHtml } = await import("shiki");
              const ext = extensionFromName(file.name).toLowerCase();
              const LANG_MAP: Record<string, string> = {
                js: "javascript",
                ts: "typescript",
                tsx: "tsx",
                jsx: "jsx",
                py: "python",
                rb: "ruby",
                rs: "rust",
                go: "go",
                java: "java",
                cpp: "cpp",
                c: "c",
                cs: "csharp",
                html: "html",
                css: "css",
                json: "json",
                xml: "xml",
                sh: "bash",
                yml: "yaml",
                yaml: "yaml",
                md: "markdown",
                txt: "text",
                sql: "sql",
              };
              const lang = LANG_MAP[ext] ?? "text";
              const html = await codeToHtml(text, { lang, theme: "github-dark" });
              if (active) setCodeHtml(html);
            } catch {
              // Shiki failed — fall back to plain text
              if (active) setCodeHtml(null);
            }
          }
        }

        if (active) {
          setObjectUrl(createdUrl);
          createdUrl = null; // ownership transferred to state
        }
      } catch (err) {
        if (createdUrl) {
          URL.revokeObjectURL(createdUrl);
          createdUrl = null;
        }
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load preview"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/files?hash=${encodeURIComponent(file.hash)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onClose();
      window.dispatchEvent(new Event("gitstore:refresh-index"));
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Delete failed");
      setIsCorrupted(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0)
        onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < files.length - 1)
        onNavigate(currentIndex + 1);
      if (e.key === " " && mediaRef.current) {
        e.preventDefault();
        if (mediaRef.current.paused) void mediaRef.current.play();
        else mediaRef.current.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, files.length, onClose, onNavigate]);

  const content = useMemo(() => {
    if (!file || !objectUrl) return null;

    // Add this check BEFORE the image check at the top of useMemo:
    const isOffice = [
      "pptx", "ppt", "docx", "doc", "xlsx", "xls"
    ].includes(file.name.split(".").pop()?.toLowerCase() ?? "") ||
      mimeType.includes("officedocument") ||
      mimeType.includes("msword") ||
      mimeType.includes("ms-excel") ||
      mimeType.includes("ms-powerpoint");

    if (isOffice && objectUrl) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-gray-900 p-12 text-white text-center max-w-sm">
          <FileIcon size={56} className="text-blue-400" />
          <div>
            <p className="font-semibold text-base">{file.name}</p>
            <p className="text-sm text-gray-400 mt-1">{formatBytes(file.size)}</p>
          </div>
          <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
            Office files cannot be previewed in the browser.
            Download to open in your Office app.
          </p>
          <a
            href={objectUrl}
            download={file.name}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Download {file.name.split(".").pop()?.toUpperCase()}
          </a>
        </div>
      );
    }

    if (mimeType.startsWith("image/")) {
      return (
        <img
          src={objectUrl}
          alt={file.name}
          className="max-h-[85vh] max-w-[90vw] rounded object-contain"
        />
      );
    }

    if (mimeType.startsWith("video/")) {
      return (
        <video
          ref={(el) => { mediaRef.current = el; }}
          src={objectUrl}
          controls
          autoPlay
          className="max-h-[85vh] max-w-[90vw] rounded"
        />
      );
    }

    if (mimeType.startsWith("audio/")) {
      return (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-900 p-12">
          <MusicIcon size={64} className="text-blue-400" />
          <p className="font-medium text-white">{file.name}</p>
          <audio
            ref={(el) => { mediaRef.current = el; }}
            src={objectUrl}
            controls
            className="w-80"
          />
        </div>
      );
    }

    if (mimeType === "application/pdf") {
      return (
        <object
          data={objectUrl}
          type="application/pdf"
          className="h-[85vh] w-[85vw] rounded"
        >
          <div className="flex flex-col items-center gap-4 p-8 text-white">
            <p>PDF cannot be displayed inline.</p>
            <a
              href={objectUrl}
              download={file.name}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Download PDF
            </a>
          </div>
        </object>
      );
    }

    if (textContent !== null) {
      if (
        mimeType.includes("markdown") ||
        mimeType.startsWith("text/markdown") ||
        file.name.endsWith(".md")
      ) {
        return (
          <article className="prose prose-invert max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
          </article>
        );
      }

      if (codeHtml) {
        return (
          <div
            className="max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        );
      }

      return (
        <pre className="max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-6 text-sm text-gray-100 whitespace-pre-wrap">
          {textContent}
        </pre>
      );
    }

    // Fallback — unknown file type
    return (
      <div className="flex flex-col items-center gap-4 text-white">
        <FileIcon size={64} />
        <p>{file.name}</p>
        <p className="text-gray-400">{formatBytes(file.size)}</p>
        <a
          href={objectUrl}
          download={file.name}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Download to view
        </a>
      </div>
    );
  }, [file, objectUrl, mimeType, textContent, codeHtml]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/60 px-4 py-3 text-white z-10">
        <div className="flex min-w-0 items-center gap-3">
          <FileIcon className="h-4 w-4 shrink-0" />
          <p className="truncate text-sm font-medium">{file.name}</p>
          <span className="hidden text-xs text-gray-300 md:inline">
            {formatBytes(file.size)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/api/files/download?hash=${encodeURIComponent(file.hash)}`}
            download={file.name}
            className="rounded p-2 hover:bg-white/10"
            aria-label="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 hover:bg-white/10"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Prev button */}
      {files.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
          aria-label="Previous file"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      )}

      {/* Content area */}
      <div className="flex items-center justify-center px-4 pt-16 pb-4 max-h-screen max-w-full">
        {loading ? (
          <div className="h-64 w-64 animate-pulse rounded-xl bg-gray-700" />
        ) : isCorrupted ? (
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
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
              >
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
        ) : error ? (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-red-400">Preview failed</p>
            <p className="text-xs text-gray-400 break-words">{error}</p>
            <a
              href={`/api/files/download?hash=${encodeURIComponent(file.hash)}`}
              download={file.name}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
            >
              Download instead
            </a>
          </div>
        ) : (
          content
        )}
      </div>

      {/* Next button */}
      {files.length > 1 && currentIndex < files.length - 1 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
          aria-label="Next file"
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
