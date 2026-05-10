"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WrapTextIcon } from "lucide-react";
import { useState } from "react";

interface TextPreviewProps {
  text: string;
  isMarkdown: boolean;
  fileName: string;
  truncated?: boolean;
}

/**
 * TextPreview
 * Renders Markdown with full GFM support, or plain text with line wrap toggle.
 * For large files (>2 MB), a truncation warning is shown.
 */
export function TextPreview({ text, isMarkdown, fileName, truncated }: TextPreviewProps) {
  const [wordWrap, setWordWrap] = useState(true);
  const lineCount = text.split("\n").length;

  if (isMarkdown) {
    return (
      <div className="flex w-[85vw] max-w-[900px] flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-500">
          <span className="font-mono">{fileName}</span>
          <span className="rounded bg-purple-950/40 px-2 py-0.5 text-purple-300 uppercase">markdown</span>
        </div>
        {truncated && (
          <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
            ⚠️ File is large — showing first 2 MB.
          </div>
        )}
        <article className="prose prose-invert max-w-none overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm" style={{ maxHeight: "78vh" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </article>
      </div>
    );
  }

  return (
    <div className="flex w-[85vw] max-w-[1200px] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{fileName}</span>
          <span>{lineCount.toLocaleString()} lines</span>
        </div>
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
      {truncated && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          ⚠️ File is large — showing first 2 MB. Download for full content.
        </div>
      )}
      <pre
        className={`overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200 ${
          wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        }`}
        style={{ maxHeight: "78vh" }}
      >
        {text}
      </pre>
    </div>
  );
}
