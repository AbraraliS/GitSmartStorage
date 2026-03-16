"use client";

import { FolderInputIcon, FolderPlusIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  addToFolderAction,
  moveFilesToTrashAction,
  moveToFolderAction,
  removeFromFolderAction,
  setStarredAction,
} from "@/app/dashboard/actions";
import type { FileRecord } from "@/types";
import { useIndex } from "@/components/providers/IndexContext";

export function BulkActionBar({
  selectedFiles,
  currentFolder,
  isFolderView,
  onClear,
}: {
  selectedFiles: FileRecord[];
  currentFolder?: string;
  isFolderView: boolean;
  onClear: () => void;
}) {
  const { setIndex } = useIndex();

  if (selectedFiles.length === 0) return null;

  const hashes = selectedFiles.map((file) => file.hash);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[115] flex justify-center px-4">
      <div className="flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={async () => {
            const targetFolder = window.prompt("Add to folder", currentFolder && currentFolder !== "/" ? currentFolder : "");
            if (!targetFolder?.trim()) return;
            const next = await addToFolderAction(hashes, targetFolder.trim());
            await setIndex(next);
            onClear();
          }}
        >
          <FolderPlusIcon className="h-4 w-4" />
          Add to folder
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={async () => {
            const targetFolder = window.prompt("Move to folder", currentFolder && currentFolder !== "/" ? currentFolder : "");
            if (!targetFolder?.trim()) return;
            const cleanTarget = targetFolder.trim();
            const next = isFolderView && currentFolder
              ? await moveToFolderAction(hashes, currentFolder, cleanTarget)
              : await addToFolderAction(hashes, cleanTarget);
            await setIndex(next);
            onClear();
          }}
        >
          <FolderInputIcon className="h-4 w-4" />
          Move to folder
        </button>
        {isFolderView && currentFolder && (
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={async () => {
              const next = await removeFromFolderAction(hashes, currentFolder);
              await setIndex(next);
              onClear();
            }}
          >
            Remove from folder
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={async () => {
            const next = await setStarredAction(hashes, true);
            await setIndex(next);
            onClear();
          }}
        >
          <StarIcon className="h-4 w-4" />
          Star all
        </button>
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={async () => {
            const next = await setStarredAction(hashes, false);
            await setIndex(next);
            onClear();
          }}
        >
          Unstar all
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          onClick={async () => {
            const next = await moveFilesToTrashAction(hashes);
            await setIndex(next);
            onClear();
          }}
        >
          <Trash2Icon className="h-4 w-4" />
          Move to trash
        </button>
        <button type="button" className="ml-auto rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={onClear} aria-label="Clear selection">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}