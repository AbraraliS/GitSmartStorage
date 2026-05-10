"use client";

import type { UploadProgress } from "@/types";

export interface LegacyUploadItem {
  id: string;
  filename: string;
  size: number;
  progress: UploadProgress;
  error?: string;
}

export function UploadQueue({
  items,
  isCommitting,
  onClear,
}: {
  items: LegacyUploadItem[];
  isCommitting?: boolean;
  onClear?: () => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Upload Queue</h2>
        {onClear && (
          <button type="button" className="text-xs text-blue-600 hover:underline" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const pct = item.progress.percentage ?? (
            item.progress.status === "done" ? 100 : 0
          );
          return (
            <div key={item.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate">{item.filename}</span>
                <span>{item.progress.status === "done" ? "Done" : `${pct}%`}</span>
              </div>
              <div className="h-2 rounded bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {isCommitting && <p className="mt-3 text-xs text-gray-500">Committing index updates...</p>}
    </section>
  );
}
