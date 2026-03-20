"use client";

import { useState } from "react";
import {
  FolderInputIcon, StarIcon, Trash2Icon,
  XIcon, RotateCcwIcon, Loader2Icon,
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
  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [error, setError] = useState<string | null>(null);

  const hashes = Array.from(selected);
  if (count === 0) return null;

  const allSelected = allHashes.length > 0 && allHashes.every((h) => selected.has(h));

  // Generic async runner — shows loading, catches errors, clears selection on success
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return; // prevent double-click
    setBusy(key);
    setError(null);
    try {
      await fn();
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-bulk-action-bar className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex flex-col items-center gap-2">
      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-950/80 px-4 py-2 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-gray-700 bg-gray-900 px-3 py-2 shadow-2xl">
        {/* Count + select all */}
        <button
          type="button"
          onClick={() => allSelected ? clearSelection() : selectAll(allHashes)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          <span className="font-semibold text-white">{count}</span>
          <span className="hidden sm:inline text-gray-400">
            {allSelected ? "Deselect all" : "Select all"}
          </span>
        </button>

        <div className="h-5 w-px bg-gray-700" />

        {inTrash ? (
          <>
            <ActionButton
              label="Restore"
              icon={<RotateCcwIcon className="h-4 w-4" />}
              busy={busy === "restore"}
              disabled={!!busy}
              onClick={() => run("restore", () => onRestore(hashes))}
              className="text-emerald-400 hover:bg-emerald-950/40"
            />
            <ActionButton
              label="Delete forever"
              icon={<Trash2Icon className="h-4 w-4" />}
              busy={busy === "delete"}
              disabled={!!busy}
              onClick={() => {
                if (!confirm(`Permanently delete ${hashes.length} file(s)? This cannot be undone.`)) return;
                void run("delete", () => onDelete(hashes));
              }}
              className="text-red-400 hover:bg-red-950/40"
            />
          </>
        ) : (
          <>
            <ActionButton
              label="Move to"
              icon={<FolderInputIcon className="h-4 w-4" />}
              busy={false}
              disabled={!!busy}
              onClick={() => onMoveToFolder(hashes)}
            />
            {currentFolder && currentFolder !== "/" && onRemoveFromFolder && (
              <ActionButton
                label="Remove from folder"
                icon={<XIcon className="h-4 w-4" />}
                busy={busy === "remove"}
                disabled={!!busy}
                onClick={() => run("remove", () => onRemoveFromFolder(hashes))}
              />
            )}
            <ActionButton
              label="Star"
              icon={<StarIcon className="h-4 w-4" />}
              busy={busy === "star"}
              disabled={!!busy}
              onClick={() => run("star", () => onStar(hashes))}
            />
            <ActionButton
              label="Trash"
              icon={<Trash2Icon className="h-4 w-4" />}
              busy={busy === "trash"}
              disabled={!!busy}
              onClick={() => run("trash", () => onTrash(hashes))}
              className="text-red-400 hover:bg-red-950/40"
            />
          </>
        )}

        <div className="h-5 w-px bg-gray-700" />

        <button
          type="button"
          onClick={clearSelection}
          disabled={!!busy}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
          aria-label="Clear selection"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  label, icon, busy, disabled, onClick, className = "",
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition ${className}`}
    >
      {busy
        ? <Loader2Icon className="h-4 w-4 animate-spin" />
        : icon
      }
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}