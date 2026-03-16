"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FileRecord } from "@/types";
import { FileCard, FolderCard } from "@/components/files/FileCard";
import { BulkActionBar } from "@/components/files/BulkActionBar";
import { ContextMenu } from "@/components/files/ContextMenu";
import { PreviewModal } from "@/components/preview/PreviewModal";
import {
  addToFolderAction,
  deleteFolderAction,
  moveFolderAction,
  moveToTrashAction,
  moveToFolderAction,
  renameFileAction,
  renameFolderAction,
  toggleFolderStarAction,
  toggleStarAction,
} from "@/app/dashboard/actions";
import { useIndex } from "@/components/providers/IndexContext";
import { useUpload } from "@/components/providers/UploadContext";
import { classifyFile } from "@/lib/nodes";

interface FolderEntry {
  name: string;
  path: string;
}

export function FileGrid({
  files,
  folders,
  currentFolder,
  isFolderView,
}: {
  files: FileRecord[];
  folders: FolderEntry[];
  currentFolder?: string;
  isFolderView: boolean;
}) {
  const { setIndex, index: indexData } = useIndex();
  const { addFilesToFolder } = useUpload();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ hash: string; x: number; y: number } | null>(null);

  const currentFile = menu ? files.find((f) => f.hash === menu.hash) : null;
  const previewFiles = useMemo(() => files.filter((f) => !f.trashed), [files]);
  const selectedFiles = useMemo(
    () => files.filter((file) => selected[file.hash]),
    [files, selected]
  );
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

  const openFolder = (folderPath: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("node");
    next.delete("folder");
    next.set("view", "folder");
    next.set("path", folderPath);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <>
      <div ref={containerRef} className="space-y-4">
        {files.length > 0 && (
          <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-200">
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
              className="h-4 w-4 rounded border-gray-300"
            />
            Select all
          </label>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {folders.map((folder) => (
            <FolderCard
              key={folder.path}
              name={folder.name}
              path={folder.path}
              index={
                indexData ?? {
                  files: {},
                  nodes: {},
                  search_index: {},
                  folders: {},
                  repoShards: {},
                  updated_at: "",
                  version: 2,
                }
              }
              starred={!!indexData?.folders?.[folder.path]?.starred}
              onOpen={() => openFolder(folder.path)}
              onToggleStar={async () => {
                const next = await toggleFolderStarAction(folder.path);
                await setIndex(next);
              }}
              onRename={async () => {
                const newName = window.prompt("Rename folder", folder.name);
                if (!newName?.trim() || newName.trim() === folder.name) return;
                const result = await renameFolderAction(folder.path, newName.trim());
                await setIndex(result.index);
                if (params.get("path") === folder.path) {
                  router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
                }
              }}
              onMove={async () => {
                const defaultParent = folder.path.includes("/")
                  ? folder.path.split("/").slice(0, -1).join("/")
                  : "/";
                const destination = window.prompt(
                  "Move folder to path (leave empty for root)",
                  defaultParent || "/"
                );
                if (destination === null) return;
                const result = await moveFolderAction(folder.path, destination.trim() || "/");
                await setIndex(result.index);
                if (params.get("path") === folder.path) {
                  router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
                }
              }}
              onDelete={async () => {
                const confirmed = window.confirm(
                  `Delete folder "${folder.name}"?\n\nFiles inside will NOT be deleted — they will move back to the default directory.`
                );
                if (!confirmed) return;
                const next = await deleteFolderAction(folder.path);
                await setIndex(next);
                if (params.get("path") === folder.path) {
                  router.replace("/dashboard");
                }
              }}
              onDropFiles={(droppedFiles) => {
                for (const droppedFile of droppedFiles) {
                  const targetNode = classifyFile(droppedFile.type || "application/octet-stream");
                  addFilesToFolder([droppedFile], folder.path, { userOverride: targetNode });
                }
              }}
            />
          ))}

          {files.map((file, idx) => (
            <div
              key={file.hash}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ hash: file.hash, x: event.clientX, y: event.clientY });
              }}
            >
              <FileCard
                file={file}
                selected={!!selected[file.hash]}
                showControls={false}
                onToggleSelect={() => setSelected((prev) => ({ ...prev, [file.hash]: !prev[file.hash] }))}
                onOpen={() => setPreviewIndex(idx)}
                onMenu={(event) => {
                  event.preventDefault();
                  setMenu({ hash: file.hash, x: event.clientX, y: event.clientY });
                }}
              />
            </div>
          ))}
        </section>
      </div>

      {menu && currentFile && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          open={!!menu}
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
          starred={!!currentFile.starred}
          handlers={{
            onOpenPreview: () => {
              const pos = files.findIndex((f) => f.hash === currentFile.hash);
              setPreviewIndex(pos >= 0 ? pos : null);
              setMenu(null);
            },
            onDownload: () => {
              window.open(`/api/files/download?hash=${encodeURIComponent(currentFile.hash)}`, "_blank");
              setMenu(null);
            },
            onToggleStar: async () => {
              const next = await toggleStarAction(currentFile.hash);
              await setIndex(next);
              setMenu(null);
            },
            onRename: async () => {
              const name = window.prompt("Rename file", currentFile.name);
              if (name) {
                const next = await renameFileAction(currentFile.hash, name);
                await setIndex(next);
              }
              setMenu(null);
            },
            onMoveTo: async () => {
              const targetFolder = window.prompt("Move to folder", currentFolder && currentFolder !== "/" ? currentFolder : "");
              if (targetFolder?.trim()) {
                const cleanTarget = targetFolder.trim();
                const next = currentFolder && isFolderView
                  ? await moveToFolderAction([currentFile.hash], currentFolder, cleanTarget)
                  : await addToFolderAction([currentFile.hash], cleanTarget);
                await setIndex(next);
              }
              setMenu(null);
            },
            onTrash: async () => {
              const next = await moveToTrashAction(currentFile.hash);
              await setIndex(next);
              setMenu(null);
            },
          }}
        />
      )}

      <BulkActionBar
        selectedFiles={selectedFiles}
        currentFolder={currentFolder}
        isFolderView={isFolderView}
        onClear={() => setSelected({})}
      />

      {previewIndex !== null && previewFiles.length > 0 && (
        <PreviewModal
          files={previewFiles}
          currentIndex={Math.min(previewIndex, previewFiles.length - 1)}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </>
  );
}
