"use client";

import { FolderIcon, MinusIcon, XIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";

function statusLabel(
  status: string,
  pct: number,
  targetFolder?: string
): string {
  switch (status) {
    case "waiting_folder":
      return "Waiting for folder…";
    case "queued":
      return "Queued";
    case "hashing":
      return "Hashing…";
    case "dedup":
      return "Checking…";
    case "uploading":
      return `${pct}%`;
    case "indexing":
      return "Indexing…";
    case "done":
      return targetFolder && targetFolder !== "/" ? `✓ → ${targetFolder.split("/").pop()}` : "Done";
    case "error":
      return "Failed";
    default:
      return `${pct}%`;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    case "waiting_folder":
      return "bg-amber-500 animate-pulse";
    default:
      return "bg-blue-500";
  }
}

export function UploadTray() {
  const { uploads, minimized, setMinimized, clearCompleted } = useUpload();

  if (uploads.length === 0) return null;

  const done = uploads.filter((u) => u.status === "done").length;
  const failed = uploads.filter((u) => u.status === "error").length;
  const waiting = uploads.filter((u) => u.status === "waiting_folder").length;
  const active = uploads.length - done - failed;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm text-white shadow-xl hover:bg-gray-800"
      >
        {waiting > 0 && (
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        <span>
          {uploads.length} file{uploads.length > 1 ? "s" : ""}
        </span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-400">{done} done</span>
        {failed > 0 && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-red-400">{failed} failed</span>
          </>
        )}
      </button>
    );
  }

  return (
    <section className="fixed bottom-0 right-0 z-50 w-full border-t border-gray-700 bg-gray-900 shadow-2xl md:bottom-4 md:right-4 md:w-80 md:rounded-2xl md:border">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-100">
            {active > 0 ? `Uploading ${active} file${active > 1 ? "s" : ""}` : "Uploads"}
          </p>
          {waiting > 0 && (
            <p className="text-xs text-amber-400 mt-0.5">
              {waiting} waiting for folder selection
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {done > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            >
              Clear done
            </button>
          )}
          <button
            type="button"
            className="rounded p-1.5 hover:bg-gray-800"
            onClick={() => setMinimized(true)}
          >
            <MinusIcon className="h-4 w-4 text-gray-400" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-gray-800"
            onClick={() => setMinimized(true)}
          >
            <XIcon className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Upload list */}
      <div className="max-h-72 space-y-1 overflow-auto p-3">
        {uploads.map((item) => {
          const pct =
            item.totalChunks > 0
              ? Math.round((item.uploadedChunks / item.totalChunks) * 100)
              : item.status === "done"
              ? 100
              : 0;

          return (
            <div key={item.id} className="rounded-lg bg-gray-800/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-gray-200">
                  {item.fileName}
                </span>
                <span
                  className={`shrink-0 text-xs ${
                    item.status === "error"
                      ? "text-red-400"
                      : item.status === "done"
                      ? "text-emerald-400"
                      : item.status === "waiting_folder"
                      ? "text-amber-400"
                      : "text-gray-400"
                  }`}
                >
                  {statusLabel(item.status, pct, item.targetFolder)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1 overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${statusColor(item.status)}`}
                  style={{ width: `${item.status === "waiting_folder" ? 0 : pct}%` }}
                />
              </div>

              {/* Folder badge */}
              {item.targetFolder && item.targetFolder !== "/" && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <FolderIcon className="h-3 w-3 text-amber-500/60" />
                  <span className="truncate">{item.targetFolder}</span>
                </div>
              )}

              {/* Error message */}
              {item.status === "error" && item.error && (
                <p className="text-xs text-red-400">{item.error}</p>
              )}

              {/* Duplicate / skipped message */}
              {item.status === "done" && item.error?.includes("duplicate") && (
                <p className="text-xs text-amber-400">{item.error}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}