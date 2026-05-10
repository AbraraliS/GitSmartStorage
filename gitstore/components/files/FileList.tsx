"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FileRecord } from "@/types";
import { formatBytes, formatDate } from "@/lib/format";
import { DownloadIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import { moveToTrashAction, toggleStarAction } from "@/app/dashboard/actions";
import { PreviewModal } from "@/components/preview/PreviewModal";
import { BulkActionBar } from "@/components/files/BulkActionBar";

export function FileList({ files, currentFolder, isFolderView }: { files: FileRecord[]; currentFolder?: string; isFolderView: boolean }) {
  const { setIndex } = useIndex();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedFiles = useMemo(() => files.filter((file) => selected[file.hash]), [files, selected]);
  const allSelected = files.length > 0 && selectedFiles.length === files.length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected({});
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setSelected({});
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left dark:bg-gray-800">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) {
                      setSelected({});
                      return;
                    }
                    setSelected(Object.fromEntries(files.map((file) => [file.hash, true])));
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
                    checked={!!selected[file.hash]}
                    onChange={() => setSelected((current) => ({ ...current, [file.hash]: !current[file.hash] }))}
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
        selectedFiles={selectedFiles}
        currentFolder={currentFolder}
        isFolderView={isFolderView}
        onClear={() => setSelected({})}
      />

      {previewIndex !== null && (
        <PreviewModal files={files} currentIndex={previewIndex} onClose={() => setPreviewIndex(null)} onNavigate={setPreviewIndex} />
      )}
    </>
  );
}
