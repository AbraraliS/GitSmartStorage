"use client";

import type { UploadProgress } from "@/types";
import { formatBytes } from "@/lib/format";

interface QueueItemDisplay {
  id: string;
  filename: string;
  size: number;
  progress: UploadProgress;
  error?: string;
}

interface UploadQueueProps {
  items: QueueItemDisplay[];
  isCommitting: boolean;
  onClear: () => void;
}

const STATUS_LABELS: Record<UploadProgress["status"], string> = {
  hashing: "Computing hash…",
  dedup: "Checking duplicates…",
  uploading: "Uploading…",
  indexing: "Updating index…",
  done: "Done",
  error: "Error",
};

const STATUS_COLORS: Record<UploadProgress["status"], string> = {
  hashing: "text-blue-400",
  dedup: "text-yellow-400",
  uploading: "text-emerald-400",
  indexing: "text-purple-400",
  done: "text-emerald-400",
  error: "text-red-400",
};

export function UploadQueue({ items, isCommitting, onClear }: UploadQueueProps) {
  const allDone = items.every(
    (i) => i.progress.status === "done" || i.progress.status === "error"
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-200">
          Upload Queue
          {isCommitting && (
            <span className="ml-2 text-xs text-purple-400 font-normal">
              — committing index…
            </span>
          )}
        </h3>
        {allDone && (
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-800/50">
        {items.map((item) => {
          const pct =
            item.progress.totalChunks > 0
              ? Math.round(
                  (item.progress.uploadedChunks / item.progress.totalChunks) * 100
                )
              : 0;

          return (
            <div key={item.id} className="px-4 py-3 flex items-center gap-4">
              {/* Status indicator */}
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5">
                {item.progress.status === "done" ? (
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                ) : item.progress.status === "error" ? (
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{item.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs ${STATUS_COLORS[item.progress.status]}`}>
                    {STATUS_LABELS[item.progress.status]}
                  </span>
                  {item.error && (
                    <span className="text-xs text-gray-500">{item.error}</span>
                  )}
                  <span className="text-xs text-gray-600">{formatBytes(item.size)}</span>
                </div>

                {/* Progress bar */}
                {item.progress.status === "uploading" && (
                  <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Percent */}
              {item.progress.status === "uploading" && (
                <span className="text-xs text-gray-500 flex-shrink-0">{pct}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
