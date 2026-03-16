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
import { enrichUploadedFileAction } from "@/app/dashboard/actions";
import { FolderPickerDialog } from "@/components/folders/FolderPickerDialog";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface PendingUpload {
  id: string;
  file: File;
  options: {
    userOverride?: string;
    tags?: string[];
    sessionCsrfToken?: string;
  };
}

interface UploadContextValue {
  uploads: UploadItem[];
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  registerFileInput: (ref: HTMLInputElement | null) => void;
  promptUpload: (folderPath?: string) => void;
  /** Queue files for upload — shows folder picker first */
  addFiles: (files: File[], options?: { userOverride?: string; tags?: string[] }) => void;
  /** Skip folder picker and upload directly to a known folder */
  addFilesToFolder: (files: File[], folderPath: string, options?: { userOverride?: string; tags?: string[] }) => void;
  clearCompleted: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const UploadContext = createContext<UploadContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function UploadProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { index, refresh } = useIndex();

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [minimized, setMinimized] = useState(false);

  // Files waiting for folder selection
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[] | null>(null);
  const [pendingFolderForUpload, setPendingFolderForUpload] = useState(false);
  const [selectedFolderForNextUpload, setSelectedFolderForNextUpload] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
      );
    },
    []
  );

  const maybeAutoDismiss = useCallback(() => {
    setUploads((current) => {
      if (current.length === 0) return current;
      const allDone = current.every(
        (u) => u.status === "done" || u.status === "error"
      );
      if (allDone) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setUploads([]), 4000);
      }
      return current;
    });
  }, []);

  const registerFileInput = useCallback((ref: HTMLInputElement | null) => {
    fileInputRef.current = ref;
  }, []);

  const promptUpload = useCallback((folderPath?: string) => {
    const resolved = folderPath?.trim();

    // If a concrete destination is already known, skip picker and open files.
    if (resolved && resolved !== "/") {
      setSelectedFolderForNextUpload(resolved);
      setPendingFolderForUpload(false);
      setPendingFiles(null);
      setMinimized(false);
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 50);
      return;
    }

    // Default flow: pick folder first, then open file picker.
    setPendingFolderForUpload(true);
    setPendingFiles(null);
    setSelectedFolderForNextUpload(null);
    setMinimized(false);
  }, []);

  // ── core upload runner ────────────────────────────────────────────────────

  const runUpload = useCallback(
    async (pending: PendingUpload, targetFolder: string) => {
      const { id, file, options } = pending;
      const csrfToken =
        (session as unknown as { csrfToken?: string } | null)?.csrfToken ?? "";

      updateItem(id, { status: "hashing", targetFolder });

      try {
        const result = await runUploadPipeline({
          file,
          userOverride: options.userOverride,
          tags: options.tags,
          sessionCsrfToken: csrfToken,
          onProgress: (p) => {
            updateItem(id, {
              status: p.status,
              totalChunks: p.totalChunks,
              uploadedChunks: p.uploadedChunks,
            });
          },
        });

        if (result.skipped) {
          updateItem(id, { status: "done", hash: result.hash });
          maybeAutoDismiss();
          return;
        }

        // Build record
        const record: FileRecord = {
          hash: result.hash,
          name: file.name,
          node: result.nodeName,
          path: result.path,
          size: file.size,
          type: file.type || "application/octet-stream",
          tags: options.tags ?? [],
          created: new Date().toISOString(),
          sync_status: "syncing",
          chunks: result.chunks.length > 1 ? result.chunks : undefined,
          iv: result.iv,
          encryptionKey: result.encryptionKey,
          // Set folder pointers
          folders:
            targetFolder && targetFolder !== "/"
              ? [targetFolder]
              : [],
        };

        // Commit to index
        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: [record] }),
        });
        if (!completeRes.ok) {
          const payload = await completeRes
            .json()
            .catch(() => ({ error: "Upload commit failed" }));
          throw new Error(payload.error ?? "Upload commit failed");
        }

        // Enrich with thumbnail + folder info
        await enrichUploadedFileAction(result.hash, {
          thumbnail: result.thumbnail ?? undefined,
          folders: record.folders,
          starred: false,
          trashed: false,
        });

        await new Promise((r) => setTimeout(r, 800));
        await refresh(true);

        updateItem(id, {
          status: "done",
          hash: result.hash,
          uploadedChunks: result.chunks.length,
        });
        maybeAutoDismiss();
      } catch (err) {
        updateItem(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [session, updateItem, maybeAutoDismiss, refresh]
  );

  // ── folder picker confirmation ────────────────────────────────────────────

  const handleFolderConfirm = useCallback(
    (folderPath: string) => {
      if (pendingFolderForUpload) {
        setPendingFolderForUpload(false);
        setPendingFiles(null);
        setSelectedFolderForNextUpload(folderPath);
        setTimeout(() => {
          fileInputRef.current?.click();
        }, 50);
        return;
      }

      const files = pendingFiles;
      setPendingFiles(null);
      if (!files) return;

      // Start all queued uploads now that we have a folder
      files.forEach((pending) => {
        updateItem(pending.id, {
          status: "hashing",
          targetFolder: folderPath,
        });
        void runUpload(pending, folderPath);
      });
    },
    [pendingFiles, pendingFolderForUpload, runUpload, updateItem]
  );

  const handleFolderCancel = useCallback(() => {
    if (pendingFolderForUpload) {
      setPendingFolderForUpload(false);
      setSelectedFolderForNextUpload(null);
      return;
    }

    // Remove the waiting items from the tray
    setPendingFiles((pending) => {
      if (pending) {
        const ids = new Set(pending.map((p) => p.id));
        setUploads((prev) => prev.filter((u) => !ids.has(u.id)));
      }
      return null;
    });
  }, [pendingFolderForUpload]);

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Queue files and show the folder picker before uploading.
   * This is the main entry point — used by DropZone and the New button.
   */
  const addFilesToFolder = useCallback(
    (
      files: File[],
      folderPath: string,
      options: { userOverride?: string; tags?: string[] } = {}
    ) => {
      if (files.length === 0) return;

      const csrfToken =
        (session as unknown as { csrfToken?: string } | null)?.csrfToken ?? "";

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

        const pending: PendingUpload = {
          id,
          file,
          options: { ...options, sessionCsrfToken: csrfToken },
        };

        void runUpload(pending, folderPath);
      });

      setMinimized(false);
    },
    [session, runUpload]
  );

  const addFiles = useCallback(
    (
      files: File[],
      options: { userOverride?: string; tags?: string[] } = {}
    ) => {
      if (files.length === 0) return;

      if (selectedFolderForNextUpload !== null) {
        const folder = selectedFolderForNextUpload;
        setSelectedFolderForNextUpload(null);
        addFilesToFolder(files, folder, options);
        return;
      }

      const csrfToken =
        (session as unknown as { csrfToken?: string } | null)?.csrfToken ?? "";

      const pending: PendingUpload[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        options: { ...options, sessionCsrfToken: csrfToken },
      }));

      setUploads((prev) => [
        ...prev,
        ...pending.map((p) => ({
          id: p.id,
          fileName: p.file.name,
          totalChunks: 1,
          uploadedChunks: 0,
          status: "waiting_folder" as const,
        })),
      ]);

      setPendingFiles(pending);
      setMinimized(false);
    },
    [selectedFolderForNextUpload, addFilesToFolder, session]
  );

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
      registerFileInput,
      promptUpload,
      addFiles,
      addFilesToFolder,
      clearCompleted,
    }),
    [uploads, minimized, registerFileInput, promptUpload, addFiles, addFilesToFolder, clearCompleted]
  );

  return (
    <UploadContext.Provider value={value}>
      {children}

      {/* Folder picker dialog — shown when files are waiting */}
      {(pendingFiles || pendingFolderForUpload) && index && (
        <FolderPickerDialog
          index={index}
          fileNames={pendingFiles?.map((p) => p.file.name) ?? []}
          onConfirm={handleFolderConfirm}
          onCancel={handleFolderCancel}
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
