"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, FileTextIcon, Loader2Icon } from "lucide-react";

interface DocxPreviewProps {
  /** Raw ArrayBuffer of the DOCX file — from blob.arrayBuffer() */
  arrayBuffer: ArrayBuffer;
  fileName: string;
  downloadUrl: string;
}

/**
 * DocxPreview
 *
 * Renders DOCX files using mammoth.js.
 * mammoth converts .docx (OOXML) to sanitized HTML.
 *
 * Security: output is sanitized via DOMPurify before rendering.
 * mammoth itself is lazy-imported — not bundled globally.
 *
 * Correct architecture:
 *   blob.arrayBuffer() → mammoth.convertToHtml() → DOMPurify.sanitize() → dangerouslySetInnerHTML
 *
 * NEVER: blob.text() on a .docx (binary ZIP container → produces garbage)
 */
export function DocxPreview({ arrayBuffer, fileName, downloadUrl }: DocxPreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const convert = async () => {
      try {
        // Lazy-import mammoth — only loads when DOCX preview needed
        const mammoth = await import("mammoth");

        // Pass a copy of the ArrayBuffer — mammoth may consume it
        const buffer = arrayBuffer.slice(0);
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });

        if (!alive) return;

        // Lazy-import DOMPurify for sanitization
        const DOMPurify = (await import("dompurify")).default;

        const clean = DOMPurify.sanitize(result.value, {
          ALLOWED_TAGS: [
            "p", "br", "strong", "em", "u", "s", "del", "ins",
            "h1", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "li",
            "table", "thead", "tbody", "tr", "th", "td",
            "blockquote", "pre", "code", "span", "div",
            "a", "img",
          ],
          ALLOWED_ATTR: ["href", "src", "alt", "class", "colspan", "rowspan", "style"],
          // Strip script-adjacent attributes
          FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        });

        setHtml(clean);
        setMessages(result.messages.map((m) => m.message));
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "DOCX conversion failed");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void convert();
    return () => { alive = false; };
  }, [arrayBuffer]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-red-900/30 bg-gray-900 px-8 py-10 text-center">
        <p className="font-semibold text-red-400">DOCX preview failed</p>
        <p className="text-xs text-gray-500">{error}</p>
        <a href={downloadUrl} download={fileName}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition">
          <DownloadIcon className="h-4 w-4" />
          Download DOCX
        </a>
      </div>
    );
  }

  return (
    <div className="flex w-[85vw] max-w-[900px] flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-2 font-mono">
          <FileTextIcon className="h-3.5 w-3.5" />
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-950/40 px-2 py-0.5 text-blue-300 uppercase">docx</span>
          <a href={downloadUrl} download={fileName}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition">
            <DownloadIcon className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      {/* Conversion warnings */}
      {messages.length > 0 && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          ⚠️ Some formatting may not be fully supported: {messages.slice(0, 2).join("; ")}
        </div>
      )}

      {/* Rendered document */}
      <div
        className="docx-preview overflow-auto rounded-xl border border-gray-800 bg-white p-8 text-gray-900 shadow-xl"
        style={{ maxHeight: "76vh" }}
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />

      <style>{`
        .docx-preview h1 { font-size: 1.75rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .docx-preview h2 { font-size: 1.375rem; font-weight: 600; margin: 0.875rem 0 0.375rem; }
        .docx-preview h3 { font-size: 1.125rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
        .docx-preview p  { margin: 0.5rem 0; line-height: 1.7; }
        .docx-preview ul, .docx-preview ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .docx-preview li { margin: 0.25rem 0; }
        .docx-preview table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; font-size: 0.875rem; }
        .docx-preview th, .docx-preview td { border: 1px solid #d1d5db; padding: 0.375rem 0.625rem; }
        .docx-preview th { background: #f3f4f6; font-weight: 600; }
        .docx-preview strong { font-weight: 700; }
        .docx-preview em { font-style: italic; }
      `}</style>
    </div>
  );
}
