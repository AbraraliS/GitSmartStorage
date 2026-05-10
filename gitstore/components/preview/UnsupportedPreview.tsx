"use client";

import { FileIcon, DownloadIcon } from "lucide-react";
import type { FileRecord } from "@/types";
import { formatBytes } from "@/lib/format";
import { getExtension } from "@/lib/preview";

interface UnsupportedPreviewProps {
  file: FileRecord;
  objectUrl: string | null;
  downloadUrl: string;
}

export function UnsupportedPreview({ file, objectUrl, downloadUrl }: UnsupportedPreviewProps) {
  const ext = getExtension(file.name);
  return (
    <div className="flex max-w-sm flex-col items-center gap-5 rounded-2xl border border-gray-800 bg-gray-900 px-10 py-12 text-center">
      <div className="relative rounded-2xl bg-gray-800 p-5">
        <FileIcon className="h-12 w-12 text-gray-400" />
        {ext && (
          <span className="absolute -bottom-2 -right-2 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-300">
            {ext}
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-gray-100">{file.name}</p>
        <p className="mt-1 text-sm text-gray-500">{formatBytes(file.size)}</p>
        <p className="mt-2 text-xs text-gray-600">
          This file type cannot be previewed in the browser.
        </p>
      </div>
      <div className="flex gap-3">
        <a
          href={downloadUrl}
          download={file.name}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition"
        >
          <DownloadIcon className="h-4 w-4" />
          Download
        </a>
        {objectUrl && (
          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition"
          >
            Open externally
          </a>
        )}
      </div>
    </div>
  );
}
