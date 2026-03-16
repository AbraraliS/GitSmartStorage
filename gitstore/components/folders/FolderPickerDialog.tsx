"use client";

import { useCallback, useState } from "react";
import { FolderPlusIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import type { GitStoreIndex } from "@/types";
import { FolderTree } from "@/components/ui/FolderTree";
import { useIndex } from "@/components/providers/IndexContext";
import { createFolderAction } from "@/app/dashboard/actions";

interface FolderPickerDialogProps {
  index: GitStoreIndex;       // snapshot prop — used as fallback
  fileNames?: string[];
  onConfirm: (folderPath: string) => void;
  onCancel: () => void;
}

export function FolderPickerDialog({
  index: indexProp,
  fileNames = [],
  onConfirm,
  onCancel,
}: FolderPickerDialogProps) {
  // Live index from context — updates immediately when a folder is created
  const { index: liveIndex, setIndex } = useIndex();
  const index = liveIndex ?? indexProp;

  const [selected, setSelected] = useState<string>("/");
  const [search, setSearch] = useState("");

  // New-folder creation state
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Highlight state — briefly highlights the just-created folder in the tree
  const [justCreatedPath, setJustCreatedPath] = useState<string | null>(null);

  const handleNewFolderInput = (val: string) => {
    setNewFolderName(val);
    setCreateError("");
    if (val.includes("..") || val.startsWith("/") || val.includes("\\")) {
      setNewFolderError("Invalid folder name");
    } else {
      setNewFolderError("");
    }
  };

  const cancelNewFolder = () => {
    setCreatingNew(false);
    setNewFolderName("");
    setNewFolderError("");
    setCreateError("");
  };

  /** Creates the folder immediately, updates context index, and selects the new folder. */
  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed || newFolderError || creating) return;

    const fullPath = selected === "/" ? trimmed : `${selected}/${trimmed}`;

    setCreating(true);
    setCreateError("");
    try {
      const updatedIndex = await createFolderAction(
        trimmed,
        selected,
        // infer node from parent folder; fall back to "documents"
        index.folders?.[selected]?.node ?? "documents"
      );
      // Update the live IndexContext → FolderTree re-renders with the new folder
      setIndex(updatedIndex);
      // Auto-select the newly created folder
      setSelected(fullPath);
      // Flash highlight for 1.5s so user can spot it
      setJustCreatedPath(fullPath);
      setTimeout(() => setJustCreatedPath(null), 1500);
      // Reset creation form
      setCreatingNew(false);
      setNewFolderName("");
      setNewFolderError("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }, [newFolderName, newFolderError, creating, selected, setIndex]);

  const handleConfirm = useCallback(() => {
    onConfirm(selected);
  }, [onConfirm, selected]);

  const selectedLabel = selected === "/" ? "Root (no folder)" : selected;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">
              Upload destination
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {fileNames.length === 1
                ? `Uploading "${fileNames[0]}"`
                : fileNames.length > 1
                ? `Uploading ${fileNames.length} files`
                : "Choose where to save files"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folders…"
              className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none"
            />
          </div>
        </div>

        {/* Folder tree — driven by live index, re-renders after createFolderAction */}
        <div className="max-h-64 overflow-y-auto px-2 py-2">
          <FolderTree
            index={index}
            selected={creatingNew ? "" : selected}
            onSelect={(path) => {
              setSelected(path);
              setCreatingNew(false);
            }}
            showRoot
            searchQuery={search}
            highlightPath={justCreatedPath ?? undefined}
          />
        </div>

        {/* New folder creation panel */}
        <div className="border-t border-gray-800 px-4 py-3">
          {creatingNew ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Creating inside:{" "}
                <span className="font-medium text-gray-300">
                  {selected === "/" ? "Root" : selected}
                </span>
              </p>

              <div className="flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => handleNewFolderInput(e.target.value)}
                  placeholder="Folder name (e.g. Japan)"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50 disabled:opacity-50"
                  autoFocus
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      newFolderName.trim() &&
                      !newFolderError &&
                      !creating
                    ) {
                      void handleCreateFolder();
                    }
                    if (e.key === "Escape") cancelNewFolder();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleCreateFolder()}
                  disabled={!newFolderName.trim() || !!newFolderError || creating}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? (
                    <>
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create"
                  )}
                </button>
                <button
                  type="button"
                  onClick={cancelNewFolder}
                  disabled={creating}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>

              {/* Path preview */}
              {newFolderName.trim() && !newFolderError && (
                <p className="text-xs text-emerald-500/80">
                  Will create:{" "}
                  <span className="font-mono">
                    {selected === "/"
                      ? newFolderName.trim()
                      : `${selected}/${newFolderName.trim()}`}
                  </span>
                </p>
              )}

              {(newFolderError || createError) && (
                <p className="text-xs text-red-400">
                  {newFolderError || createError}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
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
        <div className="flex items-center justify-between border-t border-gray-800 px-5 py-4">
          <p className="truncate max-w-[55%] text-xs text-gray-500">
            →{" "}
            <span className="text-gray-300">{selectedLabel}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 transition-colors"
            >
              Upload here
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}