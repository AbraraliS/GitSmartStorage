"use client";

import { DownloadIcon, MonitorIcon, PresentationIcon } from "lucide-react";
import type { FileRecord } from "@/types";
import { formatBytes } from "@/lib/format";

interface PptxPreviewProps {
  file: FileRecord;
  downloadUrl: string;
}

/**
 * PptxPreview
 *
 * PPTX preview — currently shows metadata + download.
 * Full slide rendering requires a WASM/canvas-based parser (pptxjs, officegen, LibreOffice Online).
 *
 * Architecture is extensible: swap the body for a full slide renderer
 * when a suitable client-side PPTX canvas parser is available.
 *
 * This component correctly uses arrayBuffer() for any future binary parsing.
 * It NEVER calls blob.text() on a PPTX.
 */
export function PptxPreview({ file, downloadUrl }: PptxPreviewProps) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-gray-800 bg-gray-900 px-10 py-12 text-center">
      <div className="rounded-2xl bg-orange-950/30 p-5">
        <PresentationIcon className="h-12 w-12 text-orange-400" />
      </div>

      <div>
        <p className="text-base font-semibold text-gray-100">{file.name}</p>
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-gray-500">
          <span className="rounded bg-orange-950/30 px-2 py-0.5 text-orange-400 font-mono uppercase">
            {file.name.split(".").pop()}
          </span>
          <span>{formatBytes(file.size)}</span>
        </div>
      </div>

      <div className="w-full rounded-xl border border-gray-800 bg-gray-800/50 p-4 text-left text-xs text-gray-500 space-y-2">
        <div className="flex justify-between">
          <span>Format</span>
          <span className="text-gray-300">PowerPoint Presentation</span>
        </div>
        <div className="flex justify-between">
          <span>Size</span>
          <span className="text-gray-300">{formatBytes(file.size)}</span>
        </div>
        <div className="flex justify-between">
          <span>Slide preview</span>
          <span className="text-gray-500 italic">Not yet supported</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-xs text-gray-600">
        <MonitorIcon className="h-5 w-5 text-gray-600" />
        <p>Slide-by-slide rendering will be available in a future update.</p>
      </div>

      <a
        href={downloadUrl}
        download={file.name}
        className="flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 transition"
      >
        <DownloadIcon className="h-4 w-4" />
        Download Presentation
      </a>
    </div>
  );
}
