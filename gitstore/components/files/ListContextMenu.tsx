"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { FileRecord } from "@/types";
import {
  DownloadIcon,
  EyeIcon,
  FolderIcon,
  FolderInputIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";

interface FolderEntry {
  name: string;
  path: string;
}

interface MenuState {
  type: "file" | "folder";
  id: string;
  x: number; // right edge of trigger button (getBoundingClientRect().right)
  y: number; // bottom edge of trigger button (getBoundingClientRect().bottom)
}

interface ListContextMenuProps {
  menu: MenuState;
  file: FileRecord | null;
  folder: FolderEntry | null;
  starred: boolean;
  onClose: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onStar: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
  onOpenFolder: () => void;
}

const MENU_WIDTH = 192; // min-w-48 in px
const MENU_EST_HEIGHT = 220; // rough estimate, recalculated after mount

/**
 * ListContextMenu
 *
 * Portal-based context menu that anchors to the trigger button's
 * bounding rect — NOT to raw mouse cursor coordinates.
 *
 * Why bounding rect instead of clientX/clientY:
 *   - Stays attached to the row even after scroll
 *   - Works correctly inside virtualized lists
 *   - Consistent gap from the ⋮ button regardless of cursor position
 *
 * Positioning logic:
 *   1. Prefer opening below-right of the button
 *   2. Flip left if overflowing right edge of viewport
 *   3. Flip up if overflowing bottom of viewport
 *   All calculations use getBoundingClientRect() at mount time.
 */
export function ListContextMenu({
  menu,
  file,
  folder,
  starred,
  onClose,
  onPreview,
  onDownload,
  onStar,
  onRename,
  onMove,
  onTrash,
  onOpenFolder,
}: ListContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Viewport-aware position ───────────────────────────────────────────
  const getPosition = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mh = menuRef.current?.offsetHeight ?? MENU_EST_HEIGHT;

    // Default: open below-right of button
    let left = menu.x - MENU_WIDTH; // right-align to the button right edge
    let top = menu.y + 4;           // 4px gap below button

    // Flip left if overflowing right viewport edge
    if (left + MENU_WIDTH > vw - 8) left = vw - MENU_WIDTH - 8;
    // Clamp left to >= 8px
    if (left < 8) left = 8;

    // Flip up if overflowing bottom viewport edge
    if (top + mh > vh - 8) top = menu.y - mh - 4;
    // Clamp top
    if (top < 8) top = 8;

    return { left, top };
  };

  // ── Close on outside click / Escape ──────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // Use capture phase so it fires before other handlers
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onClick, true);
    };
  }, [onClose]);

  const { left, top } = getPosition();

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors";

  const menuEl = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      style={{ position: "fixed", left, top, zIndex: 9999, minWidth: MENU_WIDTH }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
    >
      {/* File-specific actions */}
      {file && (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={onPreview}>
            <EyeIcon className="h-4 w-4 shrink-0" />
            Open preview
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={onDownload}>
            <DownloadIcon className="h-4 w-4 shrink-0" />
            Download
          </button>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
        </>
      )}

      {/* Folder-specific actions */}
      {folder && (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={onOpenFolder}>
            <FolderIcon className="h-4 w-4 shrink-0" />
            Open folder
          </button>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
        </>
      )}

      {/* Shared actions */}
      <button type="button" role="menuitem" className={itemClass} onClick={onStar}>
        <StarIcon className={`h-4 w-4 shrink-0 ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
        {starred ? "Unstar" : "Star"}
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={onRename}>
        <PencilIcon className="h-4 w-4 shrink-0" />
        Rename
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={onMove}>
        <FolderInputIcon className="h-4 w-4 shrink-0" />
        Move to…
      </button>

      {/* Destructive */}
      {file && (
        <>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20`}
            onClick={onTrash}
          >
            <Trash2Icon className="h-4 w-4 shrink-0" />
            Move to trash
          </button>
        </>
      )}
    </div>
  );

  // Render via portal so it escapes any overflow:hidden containers
  if (typeof document === "undefined") return null;
  return createPortal(menuEl, document.body);
}
