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
import { useSelection } from "@/components/providers/SelectionContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RenameDialog } from "@/components/ui/RenameDialog";
import { MoveDialog } from "@/components/ui/MoveDialog";
import {
  bulkTrashAction,
  bulkDeleteAction,
  bulkRestoreAction,
  bulkMoveToFolderAction,
  removeFromFolderAction,
  bulkStarAction,
} from "@/app/dashboard/actions";
import { useActionState } from "@/components/providers/ActionStateContext";
import { useToast } from "@/components/ui/toast/ToastContext";

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
  const { setIndex, index: indexData, refresh } = useIndex();
  const { startAction, isPending } = useActionState();
  const { toast } = useToast();
  const { uploadFilesToFolder } = useUpload();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { selected, selectAll, clearSelection, count, isSelected, toggle } = useSelection();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ hash: string; x: number; y: number } | null>(null);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<FileRecord | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileRecord | null>(null);
  const [trashTarget, setTrashTarget] = useState<FileRecord | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderEntry | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<FolderEntry | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderEntry | null>(null);
  const [bulkMovePicker, setBulkMovePicker] = useState<string[] | null>(null);

  const currentFile = menu ? files.find((f) => f.hash === menu.hash) : null;
  const previewFiles = useMemo(() => files.filter((f) => !f.trashed), [files]);

  const allHashes = files.map((f) => f.hash);
  const allSelected = allHashes.length > 0 && allHashes.every((h) => selected.has(h));
  const someSelected = count > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && count > 0) clearSelection();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const target = event.target as Element;
      // Don't clear selection when clicking inside the BulkActionBar
      if (target.closest("[data-bulk-action-bar]")) return;
      if (!containerRef.current.contains(target)) {
        clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [count, clearSelection]);

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
          <div className="mb-3 flex items-center gap-3 px-1">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allSelected;
              }}
              onChange={() => allSelected ? clearSelection() : selectAll(allHashes)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs text-gray-500 font-medium">
              {someSelected ? `${count} selected` : `${files.length} files`}
            </span>
            {someSelected && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <section className="file-grid">
          {folders.map((folder) => (
            <FolderCard
              key={folder.path}
              name={folder.name}
              path={folder.path}
              index={safeIndex}
              starred={!!indexData?.folders?.[folder.path]?.starred}
              onOpen={() => openFolder(folder.path)}
              onToggleStar={async () => {
                try {
                  await startAction("star", `star:${folder.path}`, async () => {
                    const next = await toggleFolderStarAction(folder.path);
                    await setIndex(next);
                  });
                } catch (err) {
                  toast({ title: "Star failed", variant: "error", description: (err as Error).message });
                }
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
                selected={isSelected(file.hash)}
                showControls={false}
                onToggleSelect={() => toggle(file.hash)}
                onOpen={() => count > 0 ? toggle(file.hash) : setPreviewIndex(idx)}
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
              try {
                await startAction("star", `star:${currentFile.hash}`, async () => {
                  const next = await toggleStarAction(currentFile.hash);
                  await setIndex(next);
                });
              } catch (err) {
                toast({ title: "Star failed", variant: "error", description: (err as Error).message });
              }
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
        inTrash={params.get("view") === "trash"}
        currentFolder={params.get("view") === "folder" ? (params.get("path") ?? undefined) : undefined}
        allHashes={allHashes}
        onTrash={async (hashes) => {
          try {
            const next = await bulkTrashAction(hashes);
            await setIndex(next);
            await refresh(true);
            toast({ title: `${hashes.length} file${hashes.length > 1 ? "s" : ""} moved to trash`, variant: "success" });
          } catch (err) {
            toast({ title: "Trash failed", variant: "error", description: (err as Error).message });
          }
        }}
        onDelete={async (hashes) => {
          if (!confirm(`Permanently delete ${hashes.length} file(s)?`)) return;
          try {
            const next = await bulkDeleteAction(hashes);
            await setIndex(next);
            await refresh(true);
            toast({ title: `${hashes.length} file${hashes.length > 1 ? "s" : ""} permanently deleted`, variant: "success" });
          } catch (err) {
            toast({ title: "Delete failed", variant: "error", description: (err as Error).message });
          }
        }}
        onRestore={async (hashes) => {
          try {
            const next = await bulkRestoreAction(hashes);
            await setIndex(next);
            await refresh(true);
            toast({ title: `${hashes.length} file${hashes.length > 1 ? "s" : ""} restored`, variant: "success" });
          } catch (err) {
            toast({ title: "Restore failed", variant: "error", description: (err as Error).message });
          }
        }}
        onMoveToFolder={(hashes) => setBulkMovePicker(hashes)}
        onRemoveFromFolder={async (hashes) => {
          const folderPath = params.get("path") ?? "/";
          try {
            const next = await removeFromFolderAction(hashes, folderPath);
            await setIndex(next);
            toast({ title: "Removed from folder", variant: "success" });
          } catch (err) {
            toast({ title: "Remove failed", variant: "error", description: (err as Error).message });
          }
        }}
        onStar={async (hashes) => {
          try {
            const next = await bulkStarAction(hashes);
            await setIndex(next);
            toast({ title: "Updated", variant: "success" });
          } catch (err) {
            toast({ title: "Star failed", variant: "error", description: (err as Error).message });
          }
        }}
      />

      {bulkMovePicker && indexData && (
        <MoveDialog
          open
          itemName={`${bulkMovePicker.length} items`}
          itemType="file"
          currentLocation="/"
          index={indexData}
          onConfirm={async (folderPath: string) => {
            try {
              const next = await bulkMoveToFolderAction(bulkMovePicker, folderPath);
              await setIndex(next);
              clearSelection();
              setBulkMovePicker(null);
              toast({ title: `${bulkMovePicker.length} item${bulkMovePicker.length > 1 ? "s" : ""} moved`, variant: "success" });
            } catch (err) {
              toast({ title: "Move failed", variant: "error", description: (err as Error).message });
            }
          }}
          onCancel={() => setBulkMovePicker(null)}
        />
      )}

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
            await startAction("rename", `rename:${renameTarget.hash}`, async () => {
              const next = await renameFileAction(renameTarget.hash, newName);
              await setIndex(next);
              setRenameTarget(null);
              toast({ title: "File renamed", variant: "success" });
            });
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
            await startAction("move", `move:${moveTarget.hash}`, async () => {
              const next =
                currentFolder && isFolderView
                  ? await moveToFolderAction([moveTarget.hash], currentFolder, dest)
                  : await addToFolderAction([moveTarget.hash], dest);
              await setIndex(next);
              setMoveTarget(null);
              toast({ title: "File moved", variant: "success" });
            });
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
            await startAction("trash", `trash:${trashTarget.hash}`, async () => {
              const next = await moveToTrashAction(trashTarget.hash);
              await setIndex(next);
              setTrashTarget(null);
              toast({ title: `"${trashTarget.name}" moved to trash`, variant: "success" });
            });
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
            await startAction("folder-rename", `rename:${renameFolderTarget.path}`, async () => {
              const result = await renameFolderAction(renameFolderTarget.path, newName);
              await setIndex(result.index);
              if (params.get("path") === renameFolderTarget.path) {
                router.replace(
                  `/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`
                );
              }
              setRenameFolderTarget(null);
              toast({ title: "Folder renamed", variant: "success" });
            });
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
            await startAction("folder-move", `move:${moveFolderTarget.path}`, async () => {
              const result = await moveFolderAction(moveFolderTarget.path, dest);
              await setIndex(result.index);
              setMoveFolderTarget(null);
              toast({ title: "Folder moved", variant: "success" });
            });
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
            await startAction("folder-delete", `delete:${deleteFolderTarget.path}`, async () => {
              const next = await deleteFolderAction(deleteFolderTarget.path);
              await setIndex(next);
              if (params.get("path") === deleteFolderTarget.path) {
                router.replace("/dashboard");
              }
              setDeleteFolderTarget(null);
              toast({ title: "Folder deleted", variant: "success" });
            });
          }}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}
    </>
  );
}
