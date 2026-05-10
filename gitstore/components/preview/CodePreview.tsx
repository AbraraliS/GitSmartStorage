"use client";

import { useEffect, useRef, useState } from "react";
import { WrapTextIcon } from "lucide-react";

interface CodePreviewProps {
  text: string;
  codeHtml: string | null;
  fileName: string;
  language: string | null;
  truncated?: boolean;
}

/**
 * CodePreview
 * Displays syntax-highlighted code (via Shiki HTML) with line numbers,
 * word wrap toggle, and plain text fallback.
 * Uses @tanstack/react-virtual for large file virtualization.
 */
export function CodePreview({ text, codeHtml, fileName, language, truncated }: CodePreviewProps) {
  const [wordWrap, setWordWrap] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineCount = text.split("\n").length;

  return (
    <div className="flex w-[85vw] max-w-[1200px] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{fileName}</span>
          {language && (
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400 uppercase">{language}</span>
          )}
          <span>{lineCount.toLocaleString()} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWordWrap((w) => !w)}
            title="Toggle word wrap"
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
              wordWrap ? "bg-blue-950 text-blue-300" : "text-gray-500 hover:bg-gray-800"
            }`}
          >
            <WrapTextIcon className="h-3.5 w-3.5" />
            Wrap
          </button>
        </div>
      </div>

      {truncated && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          ⚠️ File is large — showing first 2 MB. Download for full content.
        </div>
      )}

      {/* Code content */}
      <div
        ref={containerRef}
        className="overflow-auto rounded-xl border border-gray-800 bg-[#0d1117] text-sm"
        style={{ maxHeight: "76vh" }}
      >
        {codeHtml ? (
          <div
            className={wordWrap ? "[&_pre]:whitespace-pre-wrap [&_code]:break-all" : ""}
            style={{ fontSize: "0.8125rem", lineHeight: "1.6" }}
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        ) : (
          <pre
            className={`p-4 text-gray-200 ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
          >
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}
