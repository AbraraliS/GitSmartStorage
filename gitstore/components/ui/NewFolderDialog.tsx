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

  // Reset state cleanly every time the dialog opens
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

  // Escape key to close
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
        // Infer node from parent folder; fall back to "documents"
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

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal
        aria-labelledby="new-folder-title"
        className="fixed left-1/2 top-1/2 z-[300] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
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
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
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
          {/* Search */}
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folders…"
              className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none"
            />
          </div>
          {/* Folder tree */}
          <div className="modal-scroll max-h-48 overflow-y-auto rounded-lg border border-gray-800">
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
            className={`w-full rounded-lg border px-3 py-2.5 text-sm bg-gray-800 text-gray-100 placeholder-gray-600 outline-none transition-colors ${
              nameError
                ? "border-red-500/60 focus:border-red-500"
                : "border-gray-700 focus:border-emerald-500/50"
            }`}
          />
          {nameError && (
            <p className="text-xs text-red-400">{nameError}</p>
          )}
          {folderName.trim() && !nameError && (
            <p className="text-xs text-gray-500">
              Will create:{" "}
              <span className="font-mono text-emerald-400">{fullPath}</span>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-5 py-4 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!folderName.trim() || !!nameError || creating}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
