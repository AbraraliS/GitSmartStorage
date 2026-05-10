"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FileRecord } from "@/types";
import { formatBytes, formatDate } from "@/lib/format";
import { DownloadIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import { moveToTrashAction, toggleStarAction, bulkTrashAction, bulkDeleteAction, bulkRestoreAction, bulkMoveToFolderAction, removeFromFolderAction, bulkStarAction } from "@/app/dashboard/actions";
import { PreviewModal } from "@/components/preview/PreviewModal";
import { BulkActionBar } from "@/components/files/BulkActionBar";
import { useSelection } from "@/components/providers/SelectionContext";
import { MoveDialog } from "@/components/ui/MoveDialog";
import { useSearchParams } from "next/navigation";

export function FileList({ files, currentFolder, isFolderView }: { files: FileRecord[]; currentFolder?: string; isFolderView: boolean }) {
  const { setIndex, index: indexData, refresh } = useIndex();
  const { selected, clearSelection, toggle, selectAll } = useSelection();
  const params = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [bulkMovePicker, setBulkMovePicker] = useState<string[] | null>(null);

  const selectedFiles = useMemo(() => files.filter((file) => selected.has(file.hash)), [files, selected]);
  const allHashes = files.map((f) => f.hash);

  const safeIndex = indexData ?? { files: {}, nodes: {}, search_index: {}, folders: {}, repoShards: {}, updated_at: "", version: 2 };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [clearSelection]);

  return (
    <>
      <div ref={containerRef} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left dark:bg-gray-800">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allHashes.length > 0 && allHashes.every((h) => selected.has(h))}
                  onChange={() => {
                    if (allHashes.every((h) => selected.has(h))) {
                      clearSelection();
                    } else {
                      selectAll(allHashes);
                    }
                  }}
                  aria-label="Select all files"
                />
              </th>
              <th className="px-3 py-2">Name</th>
              <th className="hidden px-3 py-2 md:table-cell">Type</th>
              <th className="hidden px-3 py-2 md:table-cell">Node</th>
              <th className="px-3 py-2">Modified</th>
              <th className="px-3 py-2">Size</th>
              <th className="w-36 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, idx) => (
              <tr
                key={file.hash}
                className="border-t border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                onMouseEnter={() => setHoverRow(file.hash)}
                onMouseLeave={() => setHoverRow(null)}
              >
                <td className="px-3 py-2 align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(file.hash)}
                    onChange={() => toggle(file.hash)}
                    aria-label={`Select ${file.name}`}
                  />
                </td>
                <td className="px-3 py-2 align-middle">
                  <button type="button" className="truncate text-left hover:underline" onClick={() => setPreviewIndex(idx)}>
                    {file.name}
                  </button>
                </td>
                <td className="hidden px-3 py-2 align-middle md:table-cell">{file.type}</td>
                <td className="hidden px-3 py-2 align-middle md:table-cell">{file.node}</td>
                <td className="px-3 py-2 align-middle">{formatDate(file.created)}</td>
                <td className="px-3 py-2 align-middle">{formatBytes(file.size)}</td>
                <td className="px-3 py-2 text-right align-middle">
                  {hoverRow === file.hash && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={async () => {
                          const next = await toggleStarAction(file.hash);
                          await setIndex(next);
                        }}
                        aria-label="Star"
                      >
                        <StarIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => window.open(`/api/files/download?hash=${encodeURIComponent(file.hash)}`, "_blank")}
                        aria-label="Download"
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={async () => {
                          const next = await moveToTrashAction(file.hash);
                          await setIndex(next);
                        }}
                        aria-label="Move to trash"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkActionBar
        inTrash={params.get("view") === "trash"}
        currentFolder={isFolderView ? currentFolder : undefined}
        allHashes={allHashes}
        onTrash={async (hashes) => {
          const next = await bulkTrashAction(hashes);
          await setIndex(next);
          clearSelection();
        }}
        onDelete={async (hashes) => {
          if (!confirm(`Permanently delete ${hashes.length} file(s)?`)) return;
          const next = await bulkDeleteAction(hashes);
          await setIndex(next);
          clearSelection();
        }}
        onRestore={async (hashes) => {
          const next = await bulkRestoreAction(hashes);
          await setIndex(next);
          clearSelection();
        }}
        onMoveToFolder={(hashes) => setBulkMovePicker(hashes)}
        onRemoveFromFolder={async (hashes) => {
          if (!currentFolder) return;
          const next = await removeFromFolderAction(hashes, currentFolder);
          await setIndex(next);
          clearSelection();
        }}
        onStar={async (hashes) => {
          const next = await bulkStarAction(hashes);
          await setIndex(next);
        }}
      />

      {bulkMovePicker && indexData && (
        <MoveDialog
          open
          itemName={`${bulkMovePicker.length} items`}
          itemType="file"
          currentLocation="/"
          index={safeIndex}
          onConfirm={async (dest) => {
            const next = await bulkMoveToFolderAction(bulkMovePicker, dest);
            await setIndex(next);
            clearSelection();
            setBulkMovePicker(null);
          }}
          onCancel={() => setBulkMovePicker(null)}
        />
      )}

      {previewIndex !== null && (
        <PreviewModal files={files} currentIndex={previewIndex} onClose={() => setPreviewIndex(null)} onNavigate={setPreviewIndex} />
      )}
    </>
  );
}
