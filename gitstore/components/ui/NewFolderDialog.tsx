"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlusIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import type { GitStoreIndex } from "@/types";
import { FolderTree } from "@/components/ui/FolderTree";
import { useIndex } from "@/components/providers/IndexContext";
import { createFolderAction } from "@/app/dashboard/actions";

export interface NewFolderDialogProps {
  open: boolean;
  /** Pre-select this path in the tree (current location when dialog opens) */
  defaultParentPath?: string;
  onConfirm: (createdPath: string, updatedIndex: GitStoreIndex) => void;
  onCancel: () => void;
}

/**
 * NewFolderDialog — responsive bottom-sheet on mobile, centered modal on desktop.
 * Virtual keyboard safe: pinned to bottom on mobile so the keyboard slides the
 * viewport up without hiding the name input.
 */
export function NewFolderDialog({
  open,
  defaultParentPath = "/",
  onConfirm,
  onCancel,
}: NewFolderDialogProps) {
  const { index: liveIndex, setIndex } = useIndex();
  const index = liveIndex;

  const [selectedParent, setSelectedParent] = useState(defaultParentPath);
  const [folderName, setFolderName] = useState("");
  const [nameError, setNameError] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreatedPath, setJustCreatedPath] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedParent(defaultParentPath ?? "/");
      setFolderName("");
      setNameError("");
      setSearch("");
      setCreating(false);
      setJustCreatedPath(null);
    }
  }, [open, defaultParentPath]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const fullPath =
    !selectedParent || selectedParent === "/"
      ? folderName.trim()
      : `${selectedParent}/${folderName.trim()}`;

  const validateName = useCallback(
    (val: string): string => {
      if (!val.trim()) return "Folder name cannot be empty";
      if (/[/\\]/.test(val)) return 'Name cannot contain "/" or "\\"';
      if (val.trim().startsWith(".")) return "Name cannot start with a dot";
      const tentativePath =
        !selectedParent || selectedParent === "/"
          ? val.trim()
          : `${selectedParent}/${val.trim()}`;
      if (index?.folders?.[tentativePath]) return "A folder with this name already exists here";
      return "";
    },
    [selectedParent, index]
  );

  const handleNameChange = (val: string) => {
    setFolderName(val);
    setNameError(validateName(val));
  };

  const handleCreate = useCallback(async () => {
    const error = validateName(folderName);
    if (error) { setNameError(error); return; }
    if (!folderName.trim() || creating || !index) return;

    setCreating(true);
    try {
      const updatedIndex = await createFolderAction(
        folderName.trim(),
        selectedParent === "/" ? "/" : selectedParent,
        index.folders?.[selectedParent]?.node ?? "documents"
      );
      setIndex(updatedIndex);
      setJustCreatedPath(fullPath);
      setTimeout(() => setJustCreatedPath(null), 1500);
      onConfirm(fullPath, updatedIndex);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }, [folderName, selectedParent, fullPath, creating, index, setIndex, onConfirm, validateName]);

  if (!open || !index) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[299] bg-black/70"
        onClick={onCancel}
        aria-hidden
      />

      {/*
       * Dialog:
       *   Mobile  → bottom-sheet, max-h-[90dvh], slides up, keyboard-safe
       *   Desktop → centered, max-w-md, scale-in
       */}
      <div
        role="dialog"
        aria-modal
        aria-labelledby="new-folder-title"
        className={[
          "fixed z-[300] w-full border border-gray-700 bg-gray-900 shadow-2xl flex flex-col",
          // Mobile: bottom-sheet
          "bottom-0 left-0 right-0 max-h-[90dvh] rounded-t-2xl animate-slide-up",
          // Desktop: centered
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:max-h-[85vh] sm:rounded-2xl sm:animate-fade-scale",
        ].join(" ")}
      >
        {/* Drag handle (mobile only) */}
        <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-gray-700 shrink-0 sm:hidden" aria-hidden />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <FolderPlusIcon className="h-5 w-5 text-amber-400" />
            <h2 id="new-folder-title" className="text-base font-semibold text-gray-100">
              New Folder
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="touch-target rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Location picker */}
        <div className="border-b border-gray-800 px-4 py-4 shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Create inside
          </p>
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2.5">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folders…"
              className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none"
            />
          </div>
          <div className="modal-scroll max-h-36 overflow-y-auto overscroll-contain rounded-lg border border-gray-800 sm:max-h-48">
            <FolderTree
              index={index}
              selected={selectedParent}
              onSelect={setSelectedParent}
              showRoot
              searchQuery={search}
              highlightPath={justCreatedPath ?? undefined}
            />
          </div>
        </div>

        {/* Name input */}
        <div className="px-5 py-4 space-y-2 shrink-0">
          <label
            htmlFor="new-folder-name"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Folder name
          </label>
          <input
            id="new-folder-name"
            value={folderName}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !nameError && folderName.trim()) void handleCreate();
            }}
            placeholder="e.g. Summer Trip"
            autoFocus
            autoComplete="off"
            className={`w-full rounded-xl border px-3 py-3 text-sm bg-gray-800 text-gray-100 placeholder-gray-600 outline-none transition-colors ${
              nameError
                ? "border-red-500/60 focus:border-red-500"
                : "border-gray-700 focus:border-emerald-500/50"
            }`}
          />
          {nameError && (
            <p className="text-xs text-red-400" role="alert">{nameError}</p>
          )}
          {folderName.trim() && !nameError && (
            <p className="text-xs text-gray-500">
              Will create:{" "}
              <span className="font-mono text-emerald-400">{fullPath}</span>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-800 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 shrink-0 sm:flex-row sm:justify-end sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl px-4 py-3 text-sm text-gray-400 hover:bg-gray-800 transition-colors sm:w-auto sm:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!folderName.trim() || !!nameError || creating}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors sm:w-auto sm:py-2"
          >
            {creating ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create folder"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
