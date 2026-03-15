"use client";

import { MinusIcon, XIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";

export function UploadTray() {
  const { uploads, minimized, setMinimized } = useUpload();

  if (uploads.length === 0) return null;

  const done = uploads.filter((u) => u.status === "done").length;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg md:w-auto"
      >
        {uploads.length} files · {done} done
      </button>
    );
  }

  return (
    <section className="fixed bottom-0 right-0 z-50 w-full border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 md:bottom-4 md:right-4 md:w-80 md:rounded-xl">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
        <p className="font-semibold">Uploading {uploads.length} files</p>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMinimized(true)}>
            <MinusIcon className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMinimized(true)}>
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="max-h-72 space-y-2 overflow-auto p-3">
        {uploads.map((item) => {
          const pct = item.totalChunks > 0 ? Math.round((item.uploadedChunks / item.totalChunks) * 100) : 0;
          return (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">{item.fileName}</span>
                <span className="text-gray-500">{item.status === "done" ? "Done" : `${pct}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
