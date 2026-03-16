"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { FileRecord, UploadProgress } from "@/types";
import { runUploadPipeline } from "@/lib/upload";
import { useIndex } from "@/components/providers/IndexContext";
import { FolderPickerDialog } from "@/components/folders/FolderPickerDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadItem {
  id: string;
  hash?: string;
  fileName: string;
  totalChunks: number;
  uploadedChunks: number;
  status: UploadProgress["status"] | "queued" | "waiting_folder";
  error?: string;
  targetFolder?: string;
}

interface UploadContextValue {
  uploads: UploadItem[];
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  /** Shows folder picker first, then opens file input */
  triggerUpload: (options?: { targetFolder?: string }) => void;
  /** For drag-and-drop — files already chosen, show folder picker */
  uploadFiles: (files: File[]) => void;
  /** Skip picker — upload directly to a known folder */
  uploadFilesToFolder: (files: File[], folderPath: string) => void;
  clearCompleted: () => void;
  /** Register the hidden file input element with the context */
  registerFileInput: (el: HTMLInputElement | null) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const UploadContext = createContext<UploadContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function UploadProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { index, refresh } = useIndex();

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [minimized, setMinimized] = useState(false);

  // Folder picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  // Files waiting for folder pick (drag-and-drop path)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // IDs of tray items waiting for folder pick
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  // True when picker was opened by triggerUpload — we open file input after confirm
  const [openFileInputAfterPick, setOpenFileInputAfterPick] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Folder chosen via picker; read by handleFilesFromInput.
  // useRef instead of sessionStorage: tab-isolated and synchronous.
  const pendingFolderRef = useRef<string>("/");
  const autoDismissRef = useRef<NodeJS.Timeout | null>(null);

  const registerFileInput = useCallback((el: HTMLInputElement | null) => {
    fileInputRef.current = el;
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const maybeAutoDismiss = useCallback(() => {
    setUploads((current) => {
      const allDone =
        current.length > 0 &&
        current.every((u) => u.status === "done" || u.status === "error");
      if (allDone) {
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        autoDismissRef.current = setTimeout(() => setUploads([]), 5000);
      }
      return current;
    });
  }, []);

  // ── core upload runner ────────────────────────────────────────────────────

  const runUpload = useCallback(
    async (id: string, file: File, targetFolder: string, tags: string[] = []) => {
      const csrfToken =
        (session as unknown as { csrfToken?: string } | null)?.csrfToken ?? "";

      // Resolve node and repo from index by MIME type
      const nodeEntries = Object.values(index?.nodes ?? {});
      const mimeToNodeId: Record<string, string> = {
        "image/": "photos",
        "video/": "videos",
        "audio/": "audio",
      };

      let resolvedNode = nodeEntries[0]?.id ?? "documents";
      let resolvedRepo = nodeEntries[0]?.repo ?? "gitstore-documents";

      for (const [mimePrefix, nodeId] of Object.entries(mimeToNodeId)) {
        if (file.type.startsWith(mimePrefix)) {
          const match = nodeEntries.find((n) => n.id === nodeId);
          if (match) {
            resolvedNode = match.id;
            resolvedRepo = match.repo;
            break;
          }
        }
      }

      // Fall back to the "documents" node when no MIME match was found
      if (resolvedNode === (nodeEntries[0]?.id ?? "documents")) {
        const docsNode = nodeEntries.find((n) => n.id === "documents");
        if (docsNode && !["photos", "videos", "audio"].includes(resolvedNode)) {
          resolvedNode = docsNode.id;
          resolvedRepo = docsNode.repo;
        }
      }

      updateItem(id, { status: "hashing", targetFolder });

      try {
        const result = await runUploadPipeline({
          file,
          nodeRepo: resolvedRepo,
          nodeName: resolvedNode,
          folder: targetFolder,
          tags,
          sessionCsrfToken: csrfToken,
          onProgress: (p) =>
            updateItem(id, {
              status: p.status,
              totalChunks: p.totalChunks,
              uploadedChunks: p.uploadedChunks,
            }),
        });

        if (result.skipped) {
          updateItem(id, { status: "done", hash: result.hash });
          maybeAutoDismiss();
          return;
        }

        // Build the full record — folders and thumbnail in a single write
        const record: FileRecord = {
          hash: result.hash,
          name: file.name,
          node: result.nodeName,
          path: result.path,
          size: file.size,
          type: file.type || "application/octet-stream",
          tags,
          created: new Date().toISOString(),
          sync_status: "syncing",
          chunks: result.chunks.length > 1 ? result.chunks : undefined,
          iv: result.iv,
          encryptionKey: result.encryptionKey,
          folders: targetFolder && targetFolder !== "/" ? [targetFolder] : [],
          thumbnail: result.thumbnail ?? undefined,
        };

        // Single index write — no second write from enrichUploadedFileAction
        const res = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: [record] }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Commit failed" }));
          throw new Error((err as { error?: string }).error ?? "Upload commit failed");
        }

        // Ensure the folder entry exists in the index (non-fatal)
        if (targetFolder && targetFolder !== "/") {
          const { createFolderAction } = await import("@/app/dashboard/actions");
          const folderName = targetFolder.split("/").pop() ?? targetFolder;
          const parentPath = targetFolder.includes("/")
            ? targetFolder.split("/").slice(0, -1).join("/")
            : "/";
          await createFolderAction(folderName, parentPath, record.node).catch(() => {
            // folder may already exist
          });
        }

        await refresh(true);

        updateItem(id, {
          status: "done",
          hash: result.hash,
          uploadedChunks: result.chunks.length || 1,
        });
        maybeAutoDismiss();
      } catch (err) {
        console.error("[upload] Failed:", err);
        updateItem(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [session, index, updateItem, maybeAutoDismiss, refresh]
  );

  // ── folder picker handlers ────────────────────────────────────────────────

  const handlePickerConfirm = useCallback(
    (folderPath: string) => {
      setPickerOpen(false);

      if (openFileInputAfterPick) {
        // triggerUpload path — store folder then open file input
        setOpenFileInputAfterPick(false);
        pendingFolderRef.current = folderPath;
        setTimeout(() => fileInputRef.current?.click(), 50);
        return;
      }

      // uploadFiles (drag-drop) path — start queued uploads now
      const files = pendingFiles;
      const ids = pendingIds;
      setPendingFiles([]);
      setPendingIds([]);

      files.forEach((file, i) => {
        const id = ids[i];
        if (!id) return;
        updateItem(id, { status: "hashing", targetFolder: folderPath });
        void runUpload(id, file, folderPath);
      });
    },
    [openFileInputAfterPick, pendingFiles, pendingIds, runUpload, updateItem]
  );

  const handlePickerCancel = useCallback(() => {
    setPickerOpen(false);
    setOpenFileInputAfterPick(false);
    pendingFolderRef.current = "/";
    // Remove waiting items from tray
    setPendingIds((ids) => {
      setUploads((prev) => prev.filter((u) => !ids.includes(u.id)));
      return [];
    });
    setPendingFiles([]);
  }, []);

  // ── file input handler ────────────────────────────────────────────────────

  const uploadFilesToFolder = useCallback(
    (files: File[], folderPath: string) => {
      if (files.length === 0) return;
      files.forEach((file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploads((prev) => [
          ...prev,
          {
            id,
            fileName: file.name,
            totalChunks: 1,
            uploadedChunks: 0,
            status: "queued" as const,
            targetFolder: folderPath,
          },
        ]);
        void runUpload(id, file, folderPath);
      });
      setMinimized(false);
    },
    [runUpload]
  );

  /**
   * Called by the hidden file input onChange.
   * Reads the folder from pendingFolderRef (set synchronously before .click() is called).
   */
  const handleFilesFromInput = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const folder = pendingFolderRef.current;
      pendingFolderRef.current = "/";
      uploadFilesToFolder(files, folder);
    },
    [uploadFilesToFolder]
  );

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Primary upload trigger — called by NewButton.
   * Shows folder picker FIRST (if targetFolder not known), then opens file input.
   */
  const triggerUpload = useCallback(
    (options?: { targetFolder?: string }) => {
      if (options?.targetFolder !== undefined && options.targetFolder !== "") {
        // Destination known — skip picker, open file input directly
        pendingFolderRef.current = options.targetFolder;
        setTimeout(() => fileInputRef.current?.click(), 50);
      } else {
        // Show folder picker first; file input opens after user confirms
        setOpenFileInputAfterPick(true);
        setPickerOpen(true);
        setMinimized(false);
      }
    },
    []
  );

  /**
   * For drag-and-drop — files already chosen, show folder picker.
   */
  const uploadFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const ids = files.map(
      () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    setUploads((prev) => [
      ...prev,
      ...files.map((f, i) => ({
        id: ids[i],
        fileName: f.name,
        totalChunks: 1,
        uploadedChunks: 0,
        status: "waiting_folder" as const,
      })),
    ]);

    setPendingFiles(files);
    setPendingIds(ids);
    setPickerOpen(true);
    setMinimized(false);
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter((u) => u.status !== "done" && u.status !== "error")
    );
  }, []);

  // ── context value ─────────────────────────────────────────────────────────

  const value = useMemo<UploadContextValue>(
    () => ({
      uploads,
      minimized,
      setMinimized,
      triggerUpload,
      uploadFiles,
      uploadFilesToFolder,
      clearCompleted,
      registerFileInput,
    }),
    [
      uploads,
      minimized,
      triggerUpload,
      uploadFiles,
      uploadFilesToFolder,
      clearCompleted,
      registerFileInput,
    ]
  );

  return (
    <UploadContext.Provider value={value}>
      {children}

      {/* Single hidden file input — owned here, not in DropZone */}
      <input
        ref={(el) => {
          fileInputRef.current = el;
          registerFileInput(el);
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          handleFilesFromInput(files);
        }}
      />

      {/* Folder picker — shown when triggerUpload() or uploadFiles() requests it */}
      {pickerOpen && index && (
        <FolderPickerDialog
          index={index}
          fileNames={pendingFiles.map((f) => f.name)}
          onConfirm={handlePickerConfirm}
          onCancel={handlePickerCancel}
        />
      )}
    </UploadContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}
