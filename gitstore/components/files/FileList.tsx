"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FileRecord } from "@/types";
import { formatBytes, formatDate } from "@/lib/format";
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  MoreVerticalIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import {
  bulkDeleteAction,
  bulkMoveToFolderAction,
  bulkRestoreAction,
  bulkStarAction,
  bulkTrashAction,
  moveToTrashAction,
  removeFromFolderAction,
  toggleStarAction,
  toggleFolderStarAction,
  renameFolderAction,
  renameFileAction,
  addToFolderAction,
  moveToFolderAction,
  moveFolderAction,
} from "@/app/dashboard/actions";
import { PreviewModal } from "@/components/preview/PreviewModal";
import { BulkActionBar } from "@/components/files/BulkActionBar";
import { useSelection } from "@/components/providers/SelectionContext";
import { MoveDialog } from "@/components/ui/MoveDialog";
import { RenameDialog } from "@/components/ui/RenameDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListContextMenu } from "@/components/files/ListContextMenu";

interface FolderEntry {
  name: string;
  path: string;
}

interface MenuState {
  type: "file" | "folder";
  id: string; // hash for files, path for folders
  x: number;
  y: number;
}

export function FileList({
  files,
  folders = [],
  currentFolder,
  isFolderView,
}: {
  files: FileRecord[];
  folders?: FolderEntry[];
  currentFolder?: string;
  isFolderView: boolean;
}) {
  const { setIndex, index: indexData, refresh } = useIndex();
  const { selected, clearSelection, toggle, selectAll, count, isSelected } = useSelection();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [bulkMovePicker, setBulkMovePicker] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Modal state
  const [renameTarget, setRenameTarget] = useState<FileRecord | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderEntry | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileRecord | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<FolderEntry | null>(null);
  const [trashTarget, setTrashTarget] = useState<FileRecord | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderEntry | null>(null);

  // Stable IDs for select-all: folders use path, files use hash
  const allFolderPaths = folders.map((f) => f.path);
  const allFileHashes = files.map((f) => f.hash);
  const allIds = [...allFolderPaths, ...allFileHashes];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const selectedFiles = useMemo(
    () => files.filter((f) => selected.has(f.hash)),
    [files, selected]
  );

  // Files to pass to PreviewModal — folders are not previewable
  const previewFiles = useMemo(() => files.filter((f) => !f.trashed), [files]);

  const safeIndex = indexData ?? {
    files: {}, nodes: {}, search_index: {}, folders: {},
    repoShards: {}, updated_at: "", version: 2,
  };

  // ── Keyboard / click-outside ────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clearSelection(); setMenu(null); }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const target = e.target as Element;
      if (target.closest("[data-bulk-action-bar]")) return;
      if (!containerRef.current.contains(target)) clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [clearSelection]);

  const openFolder = (folderPath: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("node");
    next.delete("folder");
    next.set("view", "folder");
    next.set("path", folderPath);
    next.set("mode", "list");
    router.push(`${pathname}?${next.toString()}`);
  };

  // ── Row shared class ────────────────────────────────────────────────────
  const rowClass = (id: string, extra = "") =>
    `group border-t border-gray-200 dark:border-gray-800 transition-colors ${
      selected.has(id)
        ? "bg-emerald-950/10 dark:bg-emerald-950/20"
        : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
    } ${extra}`;

  // ── Three-dot menu trigger ───────────────────────────────────────────────
  const openMenu = (e: React.MouseEvent, type: "file" | "folder", id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ type, id, x: rect.right, y: rect.bottom });
  };

  const menuFile = menu?.type === "file" ? files.find((f) => f.hash === menu.id) ?? null : null;
  const menuFolder = menu?.type === "folder" ? folders.find((f) => f.path === menu.id) ?? null : null;

  return (
    <>
      <div ref={containerRef} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = count > 0 && !allSelected; }}
                  onChange={() => allSelected ? clearSelection() : selectAll(allIds)}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-emerald-500 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2.5">Name</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Type</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Modified</th>
              <th className="px-3 py-2.5">Size</th>
              <th className="w-24 px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {/* ── Folder rows — always first ───────────────────────────── */}
            {folders.map((folder) => (
              <tr
                key={folder.path}
                className={rowClass(folder.path, "cursor-pointer")}
                onMouseEnter={() => setHoverRow(folder.path)}
                onMouseLeave={() => setHoverRow(null)}
                onClick={() => count > 0 ? toggle(folder.path) : openFolder(folder.path)}
                onDoubleClick={() => openFolder(folder.path)}
              >
                <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(folder.path)}
                    onChange={() => toggle(folder.path)}
                    aria-label={`Select ${folder.name}`}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-emerald-500 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-blue-950/30 p-1.5">
                      <FolderIcon className="h-4 w-4 text-blue-400" />
                    </div>
                    <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {folder.name}
                    </span>
                    {indexData?.folders?.[folder.path]?.starred && (
                      <StarIcon className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 align-middle text-gray-500 dark:text-gray-400 md:table-cell">
                  Folder
                </td>
                <td className="hidden px-3 py-2.5 align-middle text-gray-500 dark:text-gray-400 lg:table-cell">
                  —
                </td>
                <td className="px-3 py-2.5 align-middle text-gray-500 dark:text-gray-400">—</td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <div className={`inline-flex items-center gap-1 ${hoverRow === folder.path ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <button
                      type="button"
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                      onClick={(e) => openMenu(e, "folder", folder.path)}
                      aria-label="Folder options"
                    >
                      <MoreVerticalIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* ── File rows — after folders ──────────────────────────── */}
            {files.map((file, idx) => (
              <tr
                key={file.hash}
                className={rowClass(file.hash, "cursor-pointer")}
                onMouseEnter={() => setHoverRow(file.hash)}
                onMouseLeave={() => setHoverRow(null)}
                onClick={() => count > 0 ? toggle(file.hash) : setPreviewIndex(idx)}
                onDoubleClick={() => setPreviewIndex(idx)}
              >
                <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected(file.hash)}
                    onChange={() => toggle(file.hash)}
                    aria-label={`Select ${file.name}`}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-emerald-500 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-gray-800/60 p-1.5">
                      <FileIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <span className="truncate text-gray-900 dark:text-gray-100 max-w-[180px] sm:max-w-xs md:max-w-sm">
                      {file.name}
                    </span>
                    {file.starred && (
                      <StarIcon className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 align-middle text-xs text-gray-500 dark:text-gray-400 md:table-cell">
                  {file.type?.split("/")[1]?.toUpperCase() ?? "—"}
                </td>
                <td className="hidden px-3 py-2.5 align-middle text-gray-500 dark:text-gray-400 lg:table-cell">
                  {formatDate(file.created)}
                </td>
                <td className="px-3 py-2.5 align-middle text-gray-500 dark:text-gray-400">
                  {formatBytes(file.size)}
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <div className={`inline-flex items-center gap-1 ${hoverRow === file.hash ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <button
                      type="button"
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                      onClick={(e) => { e.stopPropagation(); void toggleStarAction(file.hash).then(setIndex); }}
                      aria-label="Star"
                    >
                      <StarIcon className={`h-4 w-4 ${file.starred ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                      onClick={(e) => { e.stopPropagation(); window.open(`/api/files/download?hash=${encodeURIComponent(file.hash)}`, "_blank"); }}
                      aria-label="Download"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                      onClick={(e) => { e.stopPropagation(); setTrashTarget(file); }}
                      aria-label="Move to trash"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                      onClick={(e) => openMenu(e, "file", file.hash)}
                      aria-label="More options"
                    >
                      <MoreVerticalIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {folders.length === 0 && files.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-gray-500">
                  No files or folders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Shared context menu ────────────────────────────────────────── */}
      {menu && (
        <ListContextMenu
          menu={menu}
          file={menuFile}
          folder={menuFolder}
          starred={menuFile?.starred ?? !!indexData?.folders?.[menu.id]?.starred}
          onClose={() => setMenu(null)}
          onPreview={() => {
            if (!menuFile) return;
            const pos = files.findIndex((f) => f.hash === menuFile.hash);
            setPreviewIndex(pos >= 0 ? pos : null);
            setMenu(null);
          }}
          onDownload={() => {
            if (!menuFile) return;
            window.open(`/api/files/download?hash=${encodeURIComponent(menuFile.hash)}`, "_blank");
            setMenu(null);
          }}
          onStar={async () => {
            if (menuFile) {
              const next = await toggleStarAction(menuFile.hash);
              await setIndex(next);
            } else if (menuFolder) {
              const next = await toggleFolderStarAction(menuFolder.path);
              await setIndex(next);
            }
            setMenu(null);
          }}
          onRename={() => {
            if (menuFile) setRenameTarget(menuFile);
            else if (menuFolder) setRenameFolderTarget(menuFolder);
            setMenu(null);
          }}
          onMove={() => {
            if (menuFile) setMoveTarget(menuFile);
            else if (menuFolder) setMoveFolderTarget(menuFolder);
            setMenu(null);
          }}
          onTrash={async () => {
            if (!menuFile) return;
            const next = await moveToTrashAction(menuFile.hash);
            await setIndex(next);
            setMenu(null);
          }}
          onOpenFolder={() => {
            if (!menuFolder) return;
            openFolder(menuFolder.path);
            setMenu(null);
          }}
        />
      )}

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      <BulkActionBar
        inTrash={params.get("view") === "trash"}
        currentFolder={isFolderView ? currentFolder : undefined}
        allHashes={allFileHashes}
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

      {/* ── Bulk move picker ───────────────────────────────────────────── */}
      {bulkMovePicker && indexData && (
        <MoveDialog
          open
          itemName={`${bulkMovePicker.length} items`}
          itemType="file"
          currentLocation={currentFolder ?? "/"}
          index={safeIndex}
          onConfirm={async (dest) => {
            const next = isFolderView && currentFolder
              ? await bulkMoveToFolderAction(bulkMovePicker, dest)
              : await bulkMoveToFolderAction(bulkMovePicker, dest);
            await setIndex(next);
            clearSelection();
            setBulkMovePicker(null);
            await refresh(true);
          }}
          onCancel={() => setBulkMovePicker(null)}
        />
      )}

      {/* ── Preview modal ──────────────────────────────────────────────── */}
      {previewIndex !== null && previewFiles.length > 0 && (
        <PreviewModal
          files={previewFiles}
          currentIndex={Math.min(previewIndex, previewFiles.length - 1)}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}

      {/* ── File modals ────────────────────────────────────────────────── */}
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
            const next = isFolderView && currentFolder
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

      {/* ── Folder modals ─────────────────────────────────────────────── */}
      {renameFolderTarget && (
        <RenameDialog
          open
          currentName={renameFolderTarget.name}
          type="folder"
          onConfirm={async (newName) => {
            const result = await renameFolderAction(renameFolderTarget.path, newName);
            await setIndex(result.index);
            if (params.get("path") === renameFolderTarget.path) {
              router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}&mode=list`);
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
            const { deleteFolderAction } = await import("@/app/dashboard/actions");
            const next = await deleteFolderAction(deleteFolderTarget.path);
            await setIndex(next);
            if (params.get("path") === deleteFolderTarget.path) {
              router.replace("/dashboard?mode=list");
            }
            setDeleteFolderTarget(null);
          }}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}
    </>
  );
}
