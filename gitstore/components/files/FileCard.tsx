"use client";

import { FileIcon, FolderIcon, MoreVerticalIcon } from "lucide-react";
import { formatBytes } from "@/lib/format";
import type { FileRecord } from "@/types";

export function FileCard({
  file,
  selected,
  showControls,
  onToggleSelect,
  onOpen,
  onMenu,
}: {
  file: FileRecord;
  selected: boolean;
  showControls: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const ageLabel = `${Math.max(0, Math.floor((Date.now() - new Date(file.created).getTime()) / 86400000))}d ago`;

  return (
    <article
      className={`group rounded-xl border p-2 transition ${
        selected
          ? "bg-blue-50 ring-2 ring-blue-600 dark:bg-blue-950"
          : "border-gray-200 hover:ring-2 hover:ring-blue-500 dark:border-gray-800"
      }`}
      onDoubleClick={onOpen}
    >
      <div className={`mb-2 flex items-center justify-between ${showControls ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${file.name}`}
          className="h-4 w-4 rounded border-gray-300"
        />
        <button type="button" onClick={onMenu} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open file menu">
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        {file.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.thumbnail} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <FileIcon className="h-9 w-9 text-gray-400" />
        )}
      </div>

      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)} · {ageLabel}</p>
    </article>
  );
}

export function FolderCard({
  name,
  onOpen,
}: {
  name: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-xl border border-gray-200 p-3 text-left transition hover:ring-2 hover:ring-blue-500 dark:border-gray-800"
    >
      <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30">
        <FolderIcon className="h-10 w-10 text-amber-500" />
      </div>
      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
    </button>
  );
}
