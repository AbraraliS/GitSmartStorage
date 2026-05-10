"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  DownloadIcon,
  EyeIcon,
  FolderInputIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";

export interface ContextMenuActionHandlers {
  onOpenPreview: () => void;
  onDownload: () => void;
  onToggleStar: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onTrash: () => void;
}

const MENU_WIDTH = 192;

/**
 * ContextMenu — for FileGrid right-click / ⋮ button.
 *
 * Rendered via createPortal so it escapes all overflow:hidden parents.
 * Positions using fixed coords from clientX/clientY (right-click) or
 * button bounding rect (⋮ click), with viewport collision detection.
 *
 * This replaces the broken Floating UI + raw coord hybrid which caused
 * the menu to appear far from the target item.
 */
export function ContextMenu({
  x,
  y,
  open,
  onOpenChange,
  starred,
  handlers,
}: {
  x: number;
  y: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  starred: boolean;
  handlers: ContextMenuActionHandlers;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onClick, true);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  // Viewport-aware positioning
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mh = menuRef.current?.offsetHeight ?? 220;

  let left = x;
  let top = y;

  if (left + MENU_WIDTH > vw - 8) left = vw - MENU_WIDTH - 8;
  if (left < 8) left = 8;
  if (top + mh > vh - 8) top = y - mh;
  if (top < 8) top = 8;

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors";

  const menuEl = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: "fixed", left, top, zIndex: 9999, minWidth: MENU_WIDTH }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
    >
      <button type="button" role="menuitem" className={itemClass} onClick={handlers.onOpenPreview}>
        <EyeIcon className="h-4 w-4 shrink-0" />
        Open preview
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={handlers.onDownload}>
        <DownloadIcon className="h-4 w-4 shrink-0" />
        Download
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button type="button" role="menuitem" className={itemClass} onClick={handlers.onToggleStar}>
        <StarIcon className={`h-4 w-4 shrink-0 ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
        {starred ? "Unstar" : "Star"}
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={handlers.onRename}>
        <PencilIcon className="h-4 w-4 shrink-0" />
        Rename
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={handlers.onMoveTo}>
        <FolderInputIcon className="h-4 w-4 shrink-0" />
        Move to…
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button
        type="button"
        role="menuitem"
        className={`${itemClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20`}
        onClick={handlers.onTrash}
      >
        <Trash2Icon className="h-4 w-4 shrink-0" />
        Move to trash
      </button>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(menuEl, document.body);
}
