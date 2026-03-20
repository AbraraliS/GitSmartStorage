"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpenIcon, FolderPlusIcon, SearchIcon, Trash2Icon, UploadCloudIcon } from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import {
  getSmartFolderFiles,
  getStarredFiles,
  getSubFoldersOf,
  getTrashedFiles,
  searchFiles,
} from "@/lib/index";
import { FileGrid } from "@/components/files/FileGrid";
import { FileList } from "@/components/files/FileList";
import { 
  emptyTrashAction, 
  bulkRestoreAction, 
  bulkDeleteAction 
} from "@/app/dashboard/actions";
import { DropZone } from "@/components/upload/DropZone";
import { NewFolderDialog } from "@/components/ui/NewFolderDialog";

interface FolderEntry {
  name: string;
  path: string;
}

export default function DashboardPage() {
  const { index, loading, error, setIndex } = useIndex();
  const params = useSearchParams();
  const router = useRouter();

  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);

  const view = params.get("view") ?? "";
  const node = params.get("node") ?? "";
  const path = params.get("path") ?? "";
  const smartType = params.get("type") ?? "";
  const smartValue = params.get("value") ?? "";
  const q = params.get("q") ?? "";
  const mode = params.get("mode") ?? "grid";

  useEffect(() => {
    const onNewFolder = () => setNewFolderDialogOpen(true);
    window.addEventListener("gitstore:new-folder", onNewFolder);
    return () => window.removeEventListener("gitstore:new-folder", onNewFolder);
  }, []);

  const computed = useMemo(() => {
    if (!index) return { files: [], folders: [] as FolderEntry[] };
    const toFolderEntry = (folderPath: string): FolderEntry => ({
      name: index.folders?.[folderPath]?.name ?? folderPath.split("/").pop() ?? folderPath,
      path: folderPath,
    });

    if (q.trim()) {
      return {
        files: searchFiles(index, q).filter((f) => !f.trashed),
        folders: [] as FolderEntry[],
      };
    }

    if (view === "recent") {
      return {
        files: Object.values(index.files)
          .filter((f) => !f.trashed)
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
          .slice(0, 50),
        folders: [] as FolderEntry[],
      };
    }

    if (view === "starred") {
      return {
        files: getStarredFiles(index),
        folders: Object.values(index.folders ?? {})
          .filter((folder) => folder.starred && !folder.trashed)
          .map((folder) => ({ name: folder.name, path: folder.path })),
      };
    }

    if (view === "trash") {
      const trashed = Object.values(index.files).filter((f) => f.trashed);
      // Sort by trashedAt ascending (oldest trash first)
      trashed.sort((a, b) =>
        new Date(a.trashedAt ?? a.created).getTime() -
        new Date(b.trashedAt ?? b.created).getTime()
      );
      return { files: trashed, folders: [] };
    }

    if (view === "smart") {
      if (smartType === "starred") {
        return { files: getSmartFolderFiles(index, "starred"), folders: [] as FolderEntry[] };
      }

      if (smartType === "month" || smartType === "tag" || smartType === "node") {
        return {
          files: getSmartFolderFiles(index, smartType, smartValue),
          folders: [] as FolderEntry[],
        };
      }
    }

    if (view === "folder") {
      const folderPath = path || "/";
      return {
        files: Object.values(index.files).filter(
          (f) => !f.trashed && (f.folders ?? []).includes(folderPath)
        ),
        folders: getSubFoldersOf(index, folderPath).map((folder) => toFolderEntry(folder.path)),
      };
    }

    if (node) {
      return {
        files: Object.values(index.files).filter((f) => !f.trashed && f.node === node),
        folders: [] as FolderEntry[],
      };
    }

    return {
      files: [],
      folders: getSubFoldersOf(index, "/").map((folder) => toFolderEntry(folder.path)),
    };
  }, [index, node, path, q, smartType, smartValue, view]);

  // Must be before any early returns — Rules of Hooks
  const hasLegacyFiles = useMemo(
    () => Object.values(index?.files ?? {}).some((f) => !f.trashed && f.encryptionKey && !f.fixedEncoding),
    [index]
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !index) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20">{error ?? "Failed to load index"}</p>;
  }

  const isEmpty = computed.files.length === 0 && computed.folders.length === 0;
  const activeFolderNode = path ? index.folders?.[path]?.node : undefined;
  const currentFolderPath = path || "/";
  const currentFolderName = currentFolderPath === "/"
    ? "Root"
    : currentFolderPath.split("/").filter(Boolean).at(-1) ?? "Root";

  return (
    <section className="space-y-4">
      {hasLegacyFiles && !bannerDismissed && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <p>
            <strong>⚠️ Previously uploaded files need to be re-uploaded.</strong>{" "}
            A bug in the upload pipeline caused files to be stored with corrupted encoding.
            Delete existing files and re-upload them to fix previews and downloads.
          </p>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-amber-400 hover:text-amber-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {view === "folder" && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{currentFolderName}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("gitstore:new-upload", { detail: { folder: currentFolderPath } }))}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <UploadCloudIcon className="h-4 w-4" />
              Upload here
            </button>
            <button
              type="button"
              onClick={() => setNewFolderDialogOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              <FolderPlusIcon className="h-4 w-4" />
              New folder
            </button>
          </div>
        </div>
      )}

      {view === "trash" && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Trash</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {computed.files.length} item{computed.files.length !== 1 ? "s" : ""}
              {computed.files.length > 0 && " · Files are deleted permanently after 30 days"}
            </p>
          </div>
          {computed.files.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const hashes = computed.files.map((f) => f.hash);
                  const next = await bulkRestoreAction(hashes);
                  await setIndex(next);
                }}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800"
              >
                Restore all
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Permanently delete all ${computed.files.length} trashed files? This cannot be undone.`)) return;
                  const hashes = computed.files.map((f) => f.hash);
                  const next = await bulkDeleteAction(hashes);
                  await setIndex(next);
                }}
                className="rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/40"
              >
                Empty trash
              </button>
            </div>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
          {view === "trash" ? (
            <>
              <Trash2Icon size={64} className="text-gray-300" />
              <p className="mt-3 text-gray-500">Trash is empty</p>
            </>
          ) : q ? (
            <>
              <SearchIcon size={64} className="text-gray-300" />
              <p className="mt-3 text-gray-500">No files match &quot;{q}&quot;</p>
            </>
          ) : view === "folder" ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center">
              <FolderOpenIcon size={64} className="text-gray-600" />
              <p className="text-lg text-gray-400">This folder is empty</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drop files here or click Upload to add files to{" "}
                <span className="font-medium text-gray-400">{currentFolderName}</span>
              </p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("gitstore:new-upload", { detail: { folder: currentFolderPath } }))}
                className="mt-2 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                <UploadCloudIcon className="h-4 w-4" />
                Upload to this folder
              </button>
              <div className="w-full max-w-md">
                <DropZone showEmptyPrompt />
              </div>
            </div>
          ) : (
            <>
              <FolderOpenIcon size={64} className="text-gray-300" />
              <p className="mt-3 text-gray-500">This folder is empty</p>
              <div className="mt-4 w-full max-w-md">
                <DropZone showEmptyPrompt />
              </div>
            </>
          )}
        </div>
      ) : mode === "list" ? (
        <FileList files={computed.files} currentFolder={path || undefined} isFolderView={view === "folder" && Boolean(path)} />
      ) : (
        <FileGrid files={computed.files} folders={computed.folders} currentFolder={path || undefined} isFolderView={view === "folder" && Boolean(path)} />
      )}

      <NewFolderDialog
        open={newFolderDialogOpen}
        defaultParentPath={view === "folder" ? (params.get("path") ?? "/") : "/"}
        onConfirm={(createdPath) => {
          setNewFolderDialogOpen(false);
          router.push(`/dashboard?view=folder&path=${encodeURIComponent(createdPath)}`);
        }}
        onCancel={() => setNewFolderDialogOpen(false)}
      />
    </section>
  );
}
