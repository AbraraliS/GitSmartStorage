"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { GitStoreIndex } from "@/types";
import { FolderTree } from "@/components/ui/FolderTree";
import { PendingButton } from "@/components/ui/loading/PendingButton";

export interface MoveDialogProps {
  open: boolean;
  itemName: string;
  itemType: "file" | "folder";
  /** Current parent folder path, "/" for root */
  currentLocation: string;
  /** Paths the user cannot move into (e.g. item itself + all descendants) */
  disabledPaths?: string[];
  index: GitStoreIndex;
  /** Can be async — dialog locks itself while running */
  onConfirm: (destinationPath: string) => void | Promise<void>;
  onCancel: () => void;
}

export function MoveDialog({
  open,
  itemName,
  itemType,
  currentLocation,
  disabledPaths = [],
  index,
  onConfirm,
  onCancel,
}: MoveDialogProps) {
  const [selected, setSelected] = useState<string>(currentLocation);
  const [search, setSearch] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const [pending, setPending] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelected(currentLocation);
      setSearch("");
      setCreatingNew(false);
      setNewFolderName("");
      setNewFolderError("");
      setPending(false);
    }
  }, [open, currentLocation]);

  // Escape to close — blocked while pending
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, pending]);

  if (!open) return null;

  const disabledSet = new Set([currentLocation, ...disabledPaths]);

  const resolvedDestination = creatingNew && newFolderName.trim()
    ? (selected === "/" ? "" : selected + "/") + newFolderName.trim()
    : selected;

  const destinationLabel =
    resolvedDestination === "/" ? "Root" : resolvedDestination;
  const destinationShort =
    resolvedDestination === "/"
      ? "Root"
      : (resolvedDestination.split("/").pop() ?? resolvedDestination);

  const isSameLocation = resolvedDestination === currentLocation;
  const canMove = !isSameLocation && (!creatingNew || (!!newFolderName.trim() && !newFolderError));

  const handleNewFolderInput = (val: string) => {
    setNewFolderName(val);
    if (val.includes("..") || val.startsWith("/") || val.includes("\\")) {
      setNewFolderError("Invalid folder name");
    } else {
      setNewFolderError("");
    }
  };

  const handleConfirm = async () => {
    if (!canMove || pending) return;
    setPending(true);
    try {
      await onConfirm(resolvedDestination);
    } finally {
      setPending(false);
    }
  };

  const ItemIcon = itemType === "folder" ? FolderIcon : FileIcon;
  const itemIconColor = itemType === "folder" ? "text-amber-400" : "text-blue-400";

  return (
    <>
      {/* Backdrop — blocked while pending */}
      <div
        className="fixed inset-0 z-[299] bg-black/70"
        onClick={() => { if (!pending) onCancel(); }}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal
        aria-labelledby="move-title"
        aria-busy={pending}
        className="fixed left-1/2 top-1/2 z-[300] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4 shrink-0">
          <div>
            <h2 id="move-title" className="text-base font-semibold text-gray-100">
              Move {itemType}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 truncate max-w-xs">
              <span className="inline-flex items-center gap-1">
                <ItemIcon className={`h-3.5 w-3.5 ${itemIconColor}`} />
                {itemName}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => { if (!pending) onCancel(); }}
            disabled={pending}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-30"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-800 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={pending}
              placeholder="Search folders…"
              className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none disabled:opacity-60"
            />
          </div>
        </div>

        {/* Folder tree */}
        <div className="modal-scroll overflow-y-auto flex-1 px-2 py-2">
          <FolderTree
            index={index}
            selected={creatingNew ? "" : selected}
            onSelect={(path) => { if (!pending) { setSelected(path); setCreatingNew(false); } }}
            disabledPaths={disabledSet}
            showRoot
            searchQuery={search}
          />
        </div>

        {/* New folder */}
        <div className="border-t border-gray-800 px-4 py-3 shrink-0">
          {creatingNew ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Creating inside:{" "}
                <span className="text-gray-300">
                  {selected === "/" ? "Root" : selected}
                </span>
              </p>
              <div className="flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => handleNewFolderInput(e.target.value)}
                  placeholder="Folder name (e.g. Japan)"
                  disabled={pending}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50 disabled:opacity-60"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canMove) void handleConfirm();
                    if (e.key === "Escape") setCreatingNew(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800 disabled:opacity-30"
                >
                  Cancel
                </button>
              </div>
              {newFolderError && (
                <p className="text-xs text-red-400" role="alert">{newFolderError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              disabled={pending}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-30"
            >
              <FolderPlusIcon className="h-4 w-4" />
              New folder
              {selected !== "/" && (
                <span className="ml-1 text-xs text-gray-600">
                  inside {selected.split("/").pop()}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-800 px-5 py-4 shrink-0">
          {/* Destination preview */}
          <div className="flex items-center gap-2 min-w-0 text-xs text-gray-500 truncate">
            <span className="truncate max-w-[100px] text-gray-400">{itemName}</span>
            <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-gray-600" />
            <span className="truncate text-gray-300">{destinationLabel}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors disabled:opacity-30"
            >
              Cancel
            </button>
            <PendingButton
              pending={pending}
              pendingLabel="Moving…"
              variant="primary"
              disabled={!canMove}
              onClick={() => void handleConfirm()}
              className="bg-emerald-500 hover:bg-emerald-400 text-gray-950 disabled:bg-emerald-500/40"
            >
              Move to &quot;{destinationShort}&quot;
            </PendingButton>
          </div>
        </div>
      </div>
    </>
  );
}
