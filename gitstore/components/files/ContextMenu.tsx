"use client";

import { useCallback, useMemo } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useInteractions,
  useRole,
  useDismiss,
} from "@floating-ui/react";
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
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    whileElementsMounted: autoUpdate,
    placement: "right-start",
    middleware: [offset(4), flip(), shift()],
  });

  const { getFloatingProps } = useInteractions([
    useRole(context, { role: "menu" }),
    useDismiss(context),
  ]);

  const setFloatingRef = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
    },
    [refs]
  );

  const menuStyle = useMemo(
    () => ({ ...floatingStyles, left: x, top: y }),
    [floatingStyles, x, y]
  );

  if (!open) return null;

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800";

  return (
    <div
      ref={setFloatingRef}
      style={menuStyle}
      className="z-[120] min-w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      {...getFloatingProps()}
    >
      <button type="button" className={itemClass} onClick={handlers.onOpenPreview}>
        <EyeIcon className="h-4 w-4" />
        Open preview
      </button>
      <button type="button" className={itemClass} onClick={handlers.onDownload}>
        <DownloadIcon className="h-4 w-4" />
        Download
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button type="button" className={itemClass} onClick={handlers.onToggleStar}>
        <StarIcon className="h-4 w-4" />
        {starred ? "Unstar" : "Star"}
      </button>
      <button type="button" className={itemClass} onClick={handlers.onRename}>
        <PencilIcon className="h-4 w-4" />
        Rename
      </button>
      <button type="button" className={itemClass} onClick={handlers.onMoveTo}>
        <FolderInputIcon className="h-4 w-4" />
        Move to...
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button type="button" className={itemClass} onClick={handlers.onTrash}>
        <Trash2Icon className="h-4 w-4" />
        Move to trash
      </button>
    </div>
  );
}
