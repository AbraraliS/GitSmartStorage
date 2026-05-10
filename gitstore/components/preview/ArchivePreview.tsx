"use client";

import { ArchiveIcon, DownloadIcon } from "lucide-react";
import type { FileRecord } from "@/types";
import { getArchiveInfo } from "@/lib/preview";
import { formatBytes } from "@/lib/format";

interface ArchivePreviewProps {
  file: FileRecord;
  objectUrl: string;
}

export function ArchivePreview({ file, objectUrl }: ArchivePreviewProps) {
  const info = getArchiveInfo(file);

  return (
    <div className="flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-gray-800 bg-gray-900 px-10 py-12 text-center">
      <div className="rounded-2xl bg-gray-800 p-5">
        <ArchiveIcon className="h-12 w-12 text-amber-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-100">{file.name}</p>
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-gray-500">
          <span className="rounded bg-amber-950/30 px-2 py-0.5 text-amber-400 font-mono">.{info.type}</span>
          <span>{formatBytes(file.size)}</span>
        </div>
      </div>
      <div className="w-full space-y-2 rounded-xl border border-gray-800 bg-gray-800/50 p-4 text-left text-xs text-gray-500">
        <div className="flex justify-between">
          <span>Format</span>
          <span className="text-gray-300">{info.type} archive</span>
        </div>
        <div className="flex justify-between">
          <span>Size</span>
          <span className="text-gray-300">{info.sizeFormatted}</span>
        </div>
      </div>
      <a
        href={objectUrl}
        download={file.name}
        className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition"
      >
        <DownloadIcon className="h-4 w-4" />
        Download Archive
      </a>
    </div>
  );
}
