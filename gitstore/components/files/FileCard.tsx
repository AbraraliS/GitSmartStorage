"use client";

import type { FileRecord } from "@/types";
import { formatBytes, formatDate, getMimeIcon } from "@/lib/format";

interface FileCardProps {
  file: FileRecord;
  onDelete: (hash: string) => void;
}

export function FileCard({ file, onDelete }: FileCardProps) {
  const downloadUrl = `/api/files/download?hash=${file.hash}`;

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 hover:bg-gray-900/60 transition-colors group">
      {/* Icon */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-800 flex items-center justify-center text-lg">
        {getMimeIcon(file.type)}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-100 truncate">{file.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatBytes(file.size)} · {file.node} · {formatDate(file.created)}
        </p>
        {file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {file.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sync status */}
      <div className="hidden sm:flex items-center gap-1">
        <SyncBadge status={file.sync_status} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={downloadUrl}
          download={file.name}
          className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          title="Download"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
        <button
          onClick={() => onDelete(file.hash)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SyncBadge({ status }: { status: FileRecord["sync_status"] }) {
  const styles: Record<string, string> = {
    synced: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    syncing: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <span className={`text-xs border px-1.5 py-0.5 rounded ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
