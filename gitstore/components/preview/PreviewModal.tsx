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
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    js: "text/javascript",
    ts: "text/typescript",
    html: "text/html",
    css: "text/css",
    xml: "application/xml",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((errData as { error?: string }).error ?? `Failed: ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        if (!active) return;

        // Server returns plaintext — create blob directly
        const resolvedMime = file.type || getMimeFromName(file.name);
        const blob = new Blob([buffer], { type: resolvedMime });
        createdUrl = URL.createObjectURL(blob);
        setMimeType(resolvedMime);

        // Handle text-based files
        const isText =
          resolvedMime.startsWith("text/") ||
          resolvedMime.includes("json") ||
          resolvedMime.includes("javascript") ||
          resolvedMime.includes("typescript") ||
          resolvedMime.includes("xml");

        if (isText) {
          const text = await blob.text();
          if (!active) return;
          setTextContent(text);

          const isMarkdown =
            resolvedMime.includes("markdown") ||
            resolvedMime.startsWith("text/markdown") ||
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

    // pptx, docx, xlsx — can't render inline, offer download
    if (
      mimeType.includes("officedocument") ||
      mimeType.includes("msword") ||
      mimeType.includes("ms-excel") ||
      mimeType.includes("ms-powerpoint") ||
      file.name.toLowerCase().endsWith(".pptx") ||
      file.name.toLowerCase().endsWith(".docx") ||
      file.name.toLowerCase().endsWith(".xlsx")
    ) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-gray-900 p-12 text-white">
          <FileIcon size={64} className="text-blue-400" />
          <p className="font-medium">{file.name}</p>
          <p className="text-sm text-gray-400">{formatBytes(file.size)}</p>
          <p className="text-xs text-gray-500 text-center max-w-xs">
            Office files cannot be previewed in the browser. Download to open in your Office app.
          </p>
          <a
            href={objectUrl}
            download={file.name}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Download {file.name}
          </a>
        </div>
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
