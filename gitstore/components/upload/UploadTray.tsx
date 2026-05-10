"use client";

import { FolderIcon, MinusIcon, XIcon, ZapIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";
import type { UploadPhase } from "@/types";

// ─── Phase label ─────────────────────────────────────────────────────────────

function phaseLabel(
  status: string,
  phase: UploadPhase | undefined,
  pct: number,
  totalChunks: number,
  completedChunks: number,
  targetFolder?: string,
  speedMbps?: number,
  etaSeconds?: number
): string {
  switch (status) {
    case "waiting_folder": return "Waiting for folder…";
    case "queued":         return "Queued";
    case "error":          return "Failed";
    case "done":
      return targetFolder && targetFolder !== "/"
        ? `✓ → ${targetFolder.split("/").pop()}`
        : "Done";
  }

  // Active upload phases
  switch (phase) {
    case "preparing": return "Preparing…";
    case "hashing":   return "Hashing…";
    case "finalizing": return "Finalizing…";
    case "syncing":    return "Syncing…";
    case "uploading": {
      if (totalChunks <= 1) {
        return speedMbps ? `${pct}% · ${speedMbps} MB/s` : `${pct}%`;
      }
      const chunkInfo = `${completedChunks + 1}/${totalChunks}`;
      return speedMbps
        ? `Chunk ${chunkInfo} · ${pct}% · ${speedMbps} MB/s`
        : `Uploading chunk ${chunkInfo} · ${pct}%`;
    }
  }

  return `${pct}%`;
}

// ─── ETA badge ───────────────────────────────────────────────────────────────

function formatEta(etaSeconds: number | undefined): string | null {
  if (etaSeconds == null || etaSeconds <= 0) return null;
  if (etaSeconds < 60) return `${etaSeconds}s left`;
  const mins = Math.floor(etaSeconds / 60);
  const secs = etaSeconds % 60;
  return secs > 0 ? `${mins}m ${secs}s left` : `${mins}m left`;
}

// ─── Status color ─────────────────────────────────────────────────────────────

function statusColor(status: string, phase?: UploadPhase): string {
  switch (status) {
    case "done":          return "bg-emerald-500";
    case "error":         return "bg-red-500";
    case "waiting_folder": return "bg-amber-500 animate-pulse";
    default: break;
  }
  switch (phase) {
    case "preparing":
    case "hashing":    return "bg-blue-400 animate-pulse";
    case "finalizing":
    case "syncing":    return "bg-emerald-400 animate-pulse";
    default:           return "bg-blue-500";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UploadTray() {
  const { uploads, minimized, setMinimized, clearCompleted } = useUpload();

  if (uploads.length === 0) return null;

  const done    = uploads.filter((u) => u.status === "done").length;
  const failed  = uploads.filter((u) => u.status === "error").length;
  const waiting = uploads.filter((u) => u.status === "waiting_folder").length;
  const active  = uploads.length - done - failed;

  // ── Minimized pill ───────────────────────────────────────────────────────
  if (minimized) {
    const totalPct = uploads.length > 0
      ? Math.round(uploads.reduce((s, u) => s + (u.percentage ?? 0), 0) / uploads.length)
      : 0;

    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex items-center gap-2 rounded-full bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm text-white shadow-xl hover:bg-gray-800 transition-all sm:bottom-4"
      >
        {waiting > 0 && (
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        {active > 0 && (
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        )}
        <span>
          {uploads.length} file{uploads.length > 1 ? "s" : ""}
        </span>
        {active > 0 && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-blue-300">{totalPct}%</span>
          </>
        )}
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

  // ── Full tray ────────────────────────────────────────────────────────────
  return (
    <section className="fixed bottom-0 right-0 z-50 w-full border-t border-gray-700 bg-gray-900 shadow-2xl md:bottom-4 md:right-4 md:w-80 md:rounded-2xl md:border rounded-t-2xl max-h-[60dvh] md:max-h-none flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-100">
            {active > 0
              ? `Uploading ${active} file${active > 1 ? "s" : ""}`
              : "Uploads"}
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
              className="rounded px-2 py-2 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            >
              Clear done
            </button>
          )}
          <button
            type="button"
            className="touch-target rounded hover:bg-gray-800"
            onClick={() => setMinimized(true)}
            aria-label="Minimize"
          >
            <MinusIcon className="h-4 w-4 text-gray-400" />
          </button>
          <button
            type="button"
            className="touch-target rounded hover:bg-gray-800"
            onClick={() => setMinimized(true)}
            aria-label="Close"
          >
            <XIcon className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Upload list */}
      <div className="max-h-[calc(60dvh-4rem)] space-y-1 overflow-auto overscroll-contain p-3 md:max-h-72">
        {uploads.map((item) => {
          const pct = item.percentage ?? (
            item.status === "done" ? 100 : 0
          );
          const completedChunks = item.uploadedChunks ?? 0;
          const eta = formatEta(item.etaSeconds);
          const color = statusColor(item.status, item.phase);
          const label = phaseLabel(
            item.status,
            item.phase,
            pct,
            item.totalChunks ?? 1,
            completedChunks,
            item.targetFolder,
            item.speedMbps,
            item.etaSeconds
          );

          return (
            <div key={item.id} className="rounded-lg bg-gray-800/60 p-2.5 space-y-1.5">
              {/* File name + status */}
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
                  {label}
                </span>
              </div>

              {/* Progress bar — byte-based, smooth transitions */}
              <div className="h-1 overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${color}`}
                  style={{
                    width: `${item.status === "waiting_folder" ? 0 : pct}%`,
                  }}
                />
              </div>

              {/* ETA + speed row */}
              {(eta || item.speedMbps) && item.status === "uploading" && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                  {item.speedMbps && (
                    <span className="flex items-center gap-0.5">
                      <ZapIcon className="h-2.5 w-2.5" />
                      {item.speedMbps} MB/s
                    </span>
                  )}
                  {eta && (
                    <span className="text-gray-600">{eta}</span>
                  )}
                </div>
              )}

              {/* Folder badge */}
              {item.targetFolder && item.targetFolder !== "/" && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <FolderIcon className="h-3 w-3 text-amber-500/60" />
                  <span className="truncate">{item.targetFolder}</span>
                </div>
              )}

              {/* Error message */}
              {item.status === "error" && item.error && item.error !== "Cancelled" && (
                <p className="text-xs text-red-400">{item.error}</p>
              )}
              {item.status === "error" && item.error === "Cancelled" && (
                <p className="text-xs text-gray-500">Upload cancelled</p>
              )}

              {/* Duplicate / skipped message */}
              {item.status === "done" && item.error?.includes("duplicate") && (
                <p className="text-xs text-amber-400">{item.error}</p>
              )}
            </div>
          );
        })}
      </div>
      {/* Safe-area padding for iPhone gesture bar */}
      <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
    </section>
  );
}