"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  MusicIcon,
  XIcon,
} from "lucide-react";
import type { FileRecord } from "@/types";
import { decryptChunk } from "@/lib/upload";
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

export function PreviewModal({ files, currentIndex, onClose, onNavigate }: PreviewModalProps) {
  const file = files[currentIndex];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [codeHtml, setCodeHtml] = useState<string | null>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!file) return;
    let active = true;
    let localUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setTextContent(null);
      setCodeHtml(null);

      try {
        const res = await fetch(`/api/files/download?hash=${encodeURIComponent(file.hash)}`);
        if (!res.ok) throw new Error("Failed to fetch preview content");

        let buffer = await res.arrayBuffer();
        if (file.encryptionKey && file.iv && !file.iv.includes(":")) {
          buffer = await decryptChunk(buffer, file.iv, file.encryptionKey);
        }

        const blob = new Blob([buffer], { type: file.type || "application/octet-stream" });
        localUrl = URL.createObjectURL(blob);
        if (!active) return;

        if (
          file.type.startsWith("text/") ||
          file.type.includes("json") ||
          file.type.includes("javascript") ||
          file.type.includes("typescript") ||
          file.type.includes("xml")
        ) {
          const text = await blob.text();
          if (!active) return;
          setTextContent(text);

          if (!file.type.includes("markdown") && !file.type.startsWith("text/markdown")) {
            const { codeToHtml } = await import("shiki");
            const lang = extensionFromName(file.name);
            const html = await codeToHtml(text, {
              lang,
              theme: "github-dark",
            });
            if (active) setCodeHtml(html);
          }
        }

        setObjectUrl(localUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (event.key === "ArrowRight" && currentIndex < files.length - 1) onNavigate(currentIndex + 1);
      if (event.key === " " && mediaRef.current) {
        event.preventDefault();
        if (mediaRef.current.paused) void mediaRef.current.play();
        else mediaRef.current.pause();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, files.length, onClose, onNavigate]);

  const content = useMemo(() => {
    if (!file || !objectUrl) return null;

    if (file.type.startsWith("image/")) {
      return <img src={objectUrl} alt={file.name} className="max-h-[85vh] max-w-[90vw] rounded object-contain md:rounded" />;
    }

    if (file.type.startsWith("video/")) {
      return (
        <video
          ref={(el) => {
            mediaRef.current = el;
          }}
          src={objectUrl}
          controls
          autoPlay
          className="max-h-[85vh] max-w-[90vw] rounded md:rounded"
        />
      );
    }

    if (file.type.startsWith("audio/")) {
      return (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-900 p-12">
          <MusicIcon size={64} className="text-blue-400" />
          <p className="font-medium text-white">{file.name}</p>
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={objectUrl}
            controls
            className="w-80"
          />
        </div>
      );
    }

    if (file.type === "application/pdf") {
      return <iframe src={objectUrl} className="h-[85vh] w-[85vw] rounded md:rounded" title={file.name} />;
    }

    if (textContent !== null) {
      if (file.type.includes("markdown")) {
        return (
          <article className="prose prose-invert max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
          </article>
        );
      }

      if (codeHtml) {
        return (
          <div
            className="max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-4"
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        );
      }

      return (
        <pre className="max-h-[85vh] max-w-[90vw] overflow-auto rounded bg-gray-900 p-6 text-sm text-gray-100">
          {textContent}
        </pre>
      );
    }

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
  }, [file, objectUrl, textContent, codeHtml]);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/60 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <FileIcon className="h-4 w-4" />
          <p className="truncate text-sm font-medium">{file.name}</p>
          <span className="hidden text-xs text-gray-300 md:inline">{formatBytes(file.size)}</span>
        </div>
        <div className="flex items-center gap-2">
          {objectUrl && (
            <a href={objectUrl} download={file.name} className="rounded p-2 hover:bg-white/10" aria-label="Download">
              <DownloadIcon className="h-4 w-4" />
            </a>
          )}
          <button type="button" onClick={onClose} className="rounded p-2 hover:bg-white/10" aria-label="Close preview">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {files.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
          aria-label="Previous file"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      )}

      <div className="px-4 pt-16">
        {loading ? (
          <div className="h-64 w-64 animate-pulse rounded-xl bg-gray-700" />
        ) : error ? (
          <p className="text-red-300">{error}</p>
        ) : (
          content
        )}
      </div>

      {files.length > 1 && currentIndex < files.length - 1 && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
          aria-label="Next file"
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
