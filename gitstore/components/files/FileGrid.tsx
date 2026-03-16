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
  moveToFolderAction,
  moveToTrashAction,
  renameFileAction,
  renameFolderAction,
  toggleFolderStarAction,
  toggleStarAction,
} from "@/app/dashboard/actions";
import { useIndex } from "@/components/providers/IndexContext";
import { useUpload } from "@/components/providers/UploadContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RenameDialog } from "@/components/ui/RenameDialog";
import { MoveDialog } from "@/components/ui/MoveDialog";

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
  const { uploadFilesToFolder } = useUpload();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ hash: string; x: number; y: number } | null>(null);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<FileRecord | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileRecord | null>(null);
  const [trashTarget, setTrashTarget] = useState<FileRecord | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderEntry | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<FolderEntry | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderEntry | null>(null);

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

  const safeIndex = indexData ?? {
    files: {},
    nodes: {},
    search_index: {},
    folders: {},
    repoShards: {},
    updated_at: "",
    version: 2,
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
              index={safeIndex}
              starred={!!indexData?.folders?.[folder.path]?.starred}
              onOpen={() => openFolder(folder.path)}
              onToggleStar={async () => {
                const next = await toggleFolderStarAction(folder.path);
                await setIndex(next);
              }}
              onRename={() => setRenameFolderTarget(folder)}
              onMove={() => setMoveFolderTarget(folder)}
              onDelete={() => setDeleteFolderTarget(folder)}
              onDropFiles={(droppedFiles) => {
                for (const droppedFile of droppedFiles) {
                  uploadFilesToFolder([droppedFile], folder.path);
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
                onToggleSelect={() =>
                  setSelected((prev) => ({ ...prev, [file.hash]: !prev[file.hash] }))
                }
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

      {/* Context menu */}
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
              window.open(
                `/api/files/download?hash=${encodeURIComponent(currentFile.hash)}`,
                "_blank"
              );
              setMenu(null);
            },
            onToggleStar: async () => {
              const next = await toggleStarAction(currentFile.hash);
              await setIndex(next);
              setMenu(null);
            },
            onRename: () => {
              setRenameTarget(currentFile);
              setMenu(null);
            },
            onMoveTo: () => {
              setMoveTarget(currentFile);
              setMenu(null);
            },
            onTrash: () => {
              setTrashTarget(currentFile);
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

      {/* ── File modals ─────────────────────────────────────────────────────── */}

      {renameTarget && (
        <RenameDialog
          open
          currentName={renameTarget.name}
          type="file"
          onConfirm={async (newName) => {
            const next = await renameFileAction(renameTarget.hash, newName);
            await setIndex(next);
            setRenameTarget(null);
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {moveTarget && indexData && (
        <MoveDialog
          open
          itemName={moveTarget.name}
          itemType="file"
          currentLocation={moveTarget.folders?.[0] ?? "/"}
          index={indexData}
          onConfirm={async (dest) => {
            const next =
              currentFolder && isFolderView
                ? await moveToFolderAction([moveTarget.hash], currentFolder, dest)
                : await addToFolderAction([moveTarget.hash], dest);
            await setIndex(next);
            setMoveTarget(null);
          }}
          onCancel={() => setMoveTarget(null)}
        />
      )}

      {trashTarget && (
        <ConfirmDialog
          open
          title={`Move "${trashTarget.name}" to trash?`}
          description="The file will be moved to trash. You can restore it later."
          confirmLabel="Move to trash"
          confirmVariant="danger"
          onConfirm={async () => {
            const next = await moveToTrashAction(trashTarget.hash);
            await setIndex(next);
            setTrashTarget(null);
          }}
          onCancel={() => setTrashTarget(null)}
        />
      )}

      {/* ── Folder modals ───────────────────────────────────────────────────── */}

      {renameFolderTarget && (
        <RenameDialog
          open
          currentName={renameFolderTarget.name}
          type="folder"
          onConfirm={async (newName) => {
            const result = await renameFolderAction(renameFolderTarget.path, newName);
            await setIndex(result.index);
            if (params.get("path") === renameFolderTarget.path) {
              router.replace(
                `/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`
              );
            }
            setRenameFolderTarget(null);
          }}
          onCancel={() => setRenameFolderTarget(null)}
        />
      )}

      {moveFolderTarget && indexData && (
        <MoveDialog
          open
          itemName={moveFolderTarget.name}
          itemType="folder"
          currentLocation={
            moveFolderTarget.path.includes("/")
              ? moveFolderTarget.path.split("/").slice(0, -1).join("/")
              : "/"
          }
          disabledPaths={[
            moveFolderTarget.path,
            ...Object.keys(indexData.folders ?? {}).filter((p) =>
              p.startsWith(moveFolderTarget.path + "/")
            ),
          ]}
          index={indexData}
          onConfirm={async (dest) => {
            const result = await moveFolderAction(moveFolderTarget.path, dest);
            await setIndex(result.index);
            setMoveFolderTarget(null);
          }}
          onCancel={() => setMoveFolderTarget(null)}
        />
      )}

      {deleteFolderTarget && (
        <ConfirmDialog
          open
          title={`Delete folder "${deleteFolderTarget.name}"?`}
          description="The folder will be removed. Files inside will NOT be deleted — they will return to the default directory."
          confirmLabel="Delete folder"
          confirmVariant="danger"
          onConfirm={async () => {
            const next = await deleteFolderAction(deleteFolderTarget.path);
            await setIndex(next);
            if (params.get("path") === deleteFolderTarget.path) {
              router.replace("/dashboard");
            }
            setDeleteFolderTarget(null);
          }}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}
    </>
  );
}
