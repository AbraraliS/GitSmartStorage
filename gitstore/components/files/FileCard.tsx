"use client";

import { useState } from "react";
import {
  FileIcon,
  FolderIcon,
  FolderInputIcon,
  MoreVerticalIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/format";
import { getFolderStats } from "@/lib/index";
import type { FileRecord, GitStoreIndex } from "@/types";
import { useSelection } from "@/components/providers/SelectionContext";

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800";

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
  const { isSelected, toggle, count } = useSelection();
  const isSelectedState = isSelected(file.hash);

  return (
    <article
      className={`group relative cursor-pointer rounded-xl border p-2 transition ${
        isSelectedState
          ? "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/10"
          : "border-gray-200 dark:border-gray-800 hover:ring-2 hover:ring-blue-500"
      }`}
      onClick={() => count > 0 ? toggle(file.hash) : onOpen()}
      onDoubleClick={onOpen}
    >
      <div className="absolute left-2 top-2 z-10">
        <input
          type="checkbox"
          checked={isSelectedState}
          onChange={() => toggle(file.hash)}
          onClick={(e) => e.stopPropagation()}
          className={`h-4 w-4 rounded border-gray-600 bg-gray-800 accent-emerald-500 cursor-pointer transition-opacity ${
            count > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        />
      </div>

      <div className={`mb-2 flex items-center justify-end ${showControls ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMenu(e); }} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open file menu">
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative">
        {file.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.thumbnail} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <FileIcon className="h-9 w-9 text-gray-400" />
        )}
        
        {file.trashed && file.trashedAt && (() => {
          const daysAgo = Math.floor(
            (Date.now() - new Date(file.trashedAt).getTime()) / 86400000
          );
          const daysLeft = 30 - daysAgo;
          return (
            <div className="absolute bottom-2 right-2 rounded-full border border-red-800/30 bg-red-950/80 px-1.5 py-0.5 text-[10px] text-red-400 shadow-md">
              {daysLeft <= 0 ? "Expires today" : `${daysLeft}d`}
            </div>
          );
        })()}
      </div>

      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)} · {formatDate(file.created)}</p>
    </article>
  );
}

export function FolderCard({
  name,
  path,
  index,
  starred,
  coverSrc,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onToggleStar,
  onDropFiles,
}: {
  name: string;
  path: string;
  index: GitStoreIndex;
  starred?: boolean;
  coverSrc?: string;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
  onToggleStar: () => void;
  onDropFiles?: (files: File[]) => void;
}) {
  const stats = getFolderStats(index, path);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative rounded-xl border border-gray-200 transition hover:ring-2 hover:ring-blue-500 dark:border-gray-800"
      onDragOver={(event) => {
        if (!onDropFiles) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onDropFiles) return;
        event.preventDefault();
        onDropFiles(Array.from(event.dataTransfer?.files ?? []));
      }}
    >
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
          className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Folder options"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-7 z-20 min-w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              className={menuItemClass}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStar();
                setMenuOpen(false);
              }}
            >
              <StarIcon className="h-4 w-4" />
              {starred ? "Unstar" : "Star"}
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={(event) => {
                event.stopPropagation();
                onRename();
                setMenuOpen(false);
              }}
            >
              <PencilIcon className="h-4 w-4" />
              Rename
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={(event) => {
                event.stopPropagation();
                onMove();
                setMenuOpen(false);
              }}
            >
              <FolderInputIcon className="h-4 w-4" />
              Move to...
            </button>
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              className={`${menuItemClass} text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
                setMenuOpen(false);
              }}
            >
              <Trash2Icon className="h-4 w-4" />
              Delete folder
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full p-3 text-left"
      >
        <div className="relative mb-3 flex h-24 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt={name} className="h-full w-full rounded-lg object-cover" />
          ) : (
            <FolderIcon className="h-10 w-10 text-amber-500" />
          )}
          {starred && (
            <StarIcon className="absolute bottom-2 right-2 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          )}
        </div>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{stats.fileCount}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {stats.fileCount} item{stats.fileCount !== 1 ? "s" : ""}
        {stats.totalSize > 0 ? ` · ${formatBytes(stats.totalSize)}` : ""}
      </p>
      </button>
    </div>
  );
}
