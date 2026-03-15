"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpenIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import {
  getFilesInFolder,
  getStarredFiles,
  getSubFolders,
  getTrashedFiles,
  searchFiles,
} from "@/lib/index";
import { FileGrid } from "@/components/files/FileGrid";
import { FileList } from "@/components/files/FileList";
import { createFolderAction, emptyTrashAction } from "@/app/dashboard/actions";
import { DropZone } from "@/components/upload/DropZone";

interface FolderEntry {
  name: string;
  path: string;
}

export default function DashboardPage() {
  const { index, loading, error, setIndex } = useIndex();
  const params = useSearchParams();
  const router = useRouter();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const view = params.get("view") ?? "";
  const node = params.get("node") ?? "";
  const folder = params.get("folder") ?? "/";
  const q = params.get("q") ?? "";
  const mode = params.get("mode") ?? "grid";

  useEffect(() => {
    const onNewFolder = () => setCreatingFolder(true);
    window.addEventListener("gitstore:new-folder", onNewFolder);
    return () => window.removeEventListener("gitstore:new-folder", onNewFolder);
  }, []);

  const computed = useMemo(() => {
    if (!index) return { files: [], folders: [] as FolderEntry[] };

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
          .sort((a, b) => +new Date(b.created) - +new Date(a.created))
          .slice(0, 20),
        folders: [] as FolderEntry[],
      };
    }

    if (view === "starred") {
      return { files: getStarredFiles(index), folders: [] as FolderEntry[] };
    }

    if (view === "trash") {
      return { files: getTrashedFiles(index), folders: [] as FolderEntry[] };
    }

    if (node) {
      const subFolders = getSubFolders(index, node, folder).map((name) => ({
        name,
        path: folder === "/" ? name : `${folder}/${name}`,
      }));

      return {
        folders: subFolders,
        files: getFilesInFolder(index, node, folder),
      };
    }

    return { files: [], folders: [] as FolderEntry[] };
  }, [index, node, folder, q, view]);

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

  if (!node && !view && !q) {
    const allNodes = Object.values(index.nodes);
    return (
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {allNodes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => router.push(`/dashboard?node=${n.id}`)}
            className="rounded-xl border border-gray-200 p-4 text-left hover:ring-2 hover:ring-blue-500 dark:border-gray-800"
          >
            <FolderOpenIcon className="mb-4 h-10 w-10 text-amber-500" />
            <p className="truncate text-sm font-medium">{n.id}</p>
            <p className="text-xs text-gray-500">{n.repo}</p>
          </button>
        ))}
      </section>
    );
  }

  const isEmpty = computed.files.length === 0 && computed.folders.length === 0;

  return (
    <section className="space-y-4">
      {view === "trash" && (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500"
            onClick={async () => {
              const next = await emptyTrashAction();
              await setIndex(next);
            }}
          >
            Empty trash
          </button>
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
              <p className="mt-3 text-gray-500">No files match "{q}"</p>
            </>
          ) : (
            <>
              <FolderOpenIcon size={64} className="text-gray-300" />
              <p className="mt-3 text-gray-500">This folder is empty</p>
              <div className="mt-4 w-full max-w-md">
                <DropZone showEmptyPrompt currentFolder={folder} />
              </div>
            </>
          )}
        </div>
      ) : mode === "list" ? (
        <FileList files={computed.files} />
      ) : (
        <FileGrid files={computed.files} folders={computed.folders} node={node} currentFolder={folder} />
      )}

      {creatingFolder && (
        <div className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 p-2 dark:border-blue-700 dark:bg-blue-950/40">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
            placeholder="Folder name"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setCreatingFolder(false);
                setNewFolderName("");
              }
            }}
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-2 py-1 text-sm text-white"
            onClick={async () => {
              if (!node || !newFolderName.trim()) return;
              const next = await createFolderAction(node, folder, newFolderName.trim());
              await setIndex(next);
              setCreatingFolder(false);
              setNewFolderName("");
            }}
          >
            Create
          </button>
        </div>
      )}
    </section>
  );
}
