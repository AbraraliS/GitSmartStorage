"use client";

import { useCallback, useState } from "react";
import { FolderPlusIcon, SearchIcon, XIcon } from "lucide-react";
import type { GitStoreIndex } from "@/types";
import { FolderTree } from "@/components/ui/FolderTree";

interface FolderPickerDialogProps {
  index: GitStoreIndex;
  onConfirm: (folderPath: string) => void;
  onCancel: () => void;
  fileNames?: string[];
}

export function FolderPickerDialog({
  index,
  onConfirm,
  onCancel,
  fileNames = [],
}: FolderPickerDialogProps) {
  const [selected, setSelected] = useState<string>("/");
  const [search, setSearch] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");

  const handleConfirm = useCallback(() => {
    if (creatingNew && newFolderName.trim()) {
      const base = selected === "/" ? "" : selected + "/";
      const fullPath = base + newFolderName.trim();
      onConfirm(fullPath);
    } else {
      onConfirm(selected);
    }
  }, [creatingNew, newFolderName, selected, onConfirm]);

  const handleNewFolderInput = (val: string) => {
    setNewFolderName(val);
    if (val.includes("..") || val.startsWith("/")) {
      setNewFolderError("Invalid folder name");
    } else {
      setNewFolderError("");
    }
  };

  const selectedLabel =
    creatingNew && newFolderName.trim()
      ? (selected === "/" ? "" : selected + "/") + newFolderName.trim()
      : selected === "/"
      ? "Root (no folder)"
      : selected;

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
              {fileNames.length > 0
                ? fileNames.length === 1
                  ? `Uploading "${fileNames[0]}"`
                  : `Uploading ${fileNames.length} files`
                : "Choose where to save files"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
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

        {/* Folder tree */}
        <div className="max-h-64 overflow-y-auto px-2 py-2">
          <FolderTree
            index={index}
            selected={creatingNew ? "" : selected}
            onSelect={(path) => { setSelected(path); setCreatingNew(false); }}
            showRoot
            searchQuery={search}
          />
        </div>

        {/* Create new folder */}
        <div className="border-t border-gray-800 px-4 py-3">
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
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim() && !newFolderError)
                      handleConfirm();
                    if (e.key === "Escape") setCreatingNew(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
              {newFolderError && (
                <p className="text-xs text-red-400">{newFolderError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
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
          <p className="text-xs text-gray-500 truncate max-w-[55%]">
            →{" "}
            <span className="text-gray-300">{selectedLabel || "Root"}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={creatingNew && (!newFolderName.trim() || !!newFolderError)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Upload here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}