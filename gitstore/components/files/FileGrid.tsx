"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FileRecord } from "@/types";
import { FileCard, FolderCard } from "@/components/files/FileCard";
import { ContextMenu } from "@/components/files/ContextMenu";
import { PreviewModal } from "@/components/preview/PreviewModal";
import {
  moveFileAction,
  moveToTrashAction,
  renameFileAction,
  toggleStarAction,
} from "@/app/dashboard/actions";
import { useIndex } from "@/components/providers/IndexContext";

interface FolderEntry {
  name: string;
  path: string;
}

export function FileGrid({
  files,
  folders,
  node,
  currentFolder,
}: {
  files: FileRecord[];
  folders: FolderEntry[];
  node: string;
  currentFolder: string;
}) {
  const { setIndex } = useIndex();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ hash: string; x: number; y: number } | null>(null);

  const currentFile = menu ? files.find((f) => f.hash === menu.hash) : null;
  const previewFiles = useMemo(() => files.filter((f) => !f.trashed), [files]);

  const openFolder = (folderPath: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("node", node);
    next.set("folder", folderPath);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {folders.map((folder) => (
          <FolderCard key={folder.path} name={folder.name} onOpen={() => openFolder(folder.path)} />
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
              const to = window.prompt("Move to folder", currentFolder === "/" ? "" : currentFolder);
              if (to !== null) {
                const clean = to.trim() ? to.trim() : "/";
                const next = await moveFileAction(currentFile.hash, clean);
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
