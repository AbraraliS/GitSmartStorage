"use client";

import { FileIcon, FolderIcon, MoreVerticalIcon } from "lucide-react";
import { formatBytes, formatDate } from "@/lib/format";
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
      <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)} · {formatDate(file.created)}</p>
    </article>
  );
}

export function FolderCard({
  name,
  count,
  sizeLabel,
  coverSrc,
  onOpen,
  onDropFiles,
}: {
  name: string;
  count: number;
  sizeLabel: string;
  coverSrc?: string;
  onOpen: () => void;
  onDropFiles?: (files: File[]) => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onDragOver={(event) => {
        if (!onDropFiles) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onDropFiles) return;
        event.preventDefault();
        onDropFiles(Array.from(event.dataTransfer?.files ?? []));
      }}
      className="group rounded-xl border border-gray-200 p-3 text-left transition hover:ring-2 hover:ring-blue-500 dark:border-gray-800"
    >
      <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={name} className="h-full w-full rounded-lg object-cover" />
        ) : (
          <FolderIcon className="h-10 w-10 text-amber-500" />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{count}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sizeLabel}</p>
    </button>
  );
}
