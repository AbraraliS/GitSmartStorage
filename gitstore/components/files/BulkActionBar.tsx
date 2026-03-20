"use client";

import {
  FolderInputIcon, StarIcon, Trash2Icon, XIcon,
  RotateCcwIcon, Trash2Icon as TrashPermanentIcon, UploadCloudIcon
} from "lucide-react";
import { useSelection } from "@/components/providers/SelectionContext";

interface BulkActionBarProps {
  inTrash?: boolean;
  currentFolder?: string;
  allHashes: string[];
  onTrash: (hashes: string[]) => Promise<void>;
  onDelete: (hashes: string[]) => Promise<void>;
  onRestore: (hashes: string[]) => Promise<void>;
  onMoveToFolder: (hashes: string[]) => void;
  onRemoveFromFolder?: (hashes: string[]) => Promise<void>;
  onStar: (hashes: string[]) => Promise<void>;
}

export function BulkActionBar({
  inTrash = false,
  currentFolder,
  allHashes,
  onTrash,
  onDelete,
  onRestore,
  onMoveToFolder,
  onRemoveFromFolder,
  onStar,
}: BulkActionBarProps) {
  const { selected, selectAll, clearSelection, count } = useSelection();
  const hashes = Array.from(selected);

  if (count === 0) return null;

  const allSelected = allHashes.length > 0 && allHashes.every((h) => selected.has(h));

  return (
    <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl border border-gray-700 bg-gray-900 px-3 py-2 shadow-2xl">
      {/* Selection count + select all toggle */}
      <button
        type="button"
        onClick={() => allSelected ? clearSelection() : selectAll(allHashes)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
      >
        <span className="font-semibold text-white">{count}</span>
        <span>{allSelected ? "Deselect all" : "Select all"}</span>
      </button>

      <div className="h-5 w-px bg-gray-700" />

      {inTrash ? (
        <>
          <BarButton
            icon={<RotateCcwIcon className="h-4 w-4" />}
            label="Restore"
            onClick={() => void onRestore(hashes).then(clearSelection)}
            className="text-emerald-400 hover:bg-emerald-950/40"
          />
          <BarButton
            icon={<TrashPermanentIcon className="h-4 w-4" />}
            label="Delete forever"
            onClick={() => void onDelete(hashes).then(clearSelection)}
            className="text-red-400 hover:bg-red-950/40"
          />
        </>
      ) : (
        <>
          {currentFolder && currentFolder !== "/" && (
            <BarButton
              icon={<UploadCloudIcon className="h-4 w-4" />}
              label={`Upload to ${currentFolder.split("/").pop()}`}
              onClick={() => {
                clearSelection();
                // Trigger upload with the current folder pre-selected — skips picker
                window.dispatchEvent(
                  new CustomEvent("gitstore:new-upload", {
                    detail: { targetFolder: currentFolder },
                  })
                );
              }}
            />
          )}

          <BarButton
            icon={<FolderInputIcon className="h-4 w-4" />}
            label="Move to"
            onClick={() => onMoveToFolder(hashes)}
          />
          {currentFolder && currentFolder !== "/" && onRemoveFromFolder && (
            <BarButton
              icon={<XIcon className="h-4 w-4" />}
              label="Remove from folder"
              onClick={() => void onRemoveFromFolder(hashes).then(clearSelection)}
            />
          )}
          <BarButton
            icon={<StarIcon className="h-4 w-4" />}
            label="Star"
            onClick={() => void onStar(hashes).then(clearSelection)}
          />
          <BarButton
            icon={<Trash2Icon className="h-4 w-4" />}
            label="Trash"
            onClick={() => void onTrash(hashes).then(clearSelection)}
            className="text-red-400 hover:bg-red-950/40"
          />
        </>
      )}

      {/* Deselect */}
      <div className="h-5 w-px bg-gray-700" />
      <button
        type="button"
        onClick={clearSelection}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
        aria-label="Clear selection"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function BarButton({
  icon, label, onClick, className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition ${className}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}