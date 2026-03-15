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

export interface UploadItem {
  id: string;
  hash?: string;
  fileName: string;
  totalChunks: number;
  uploadedChunks: number;
  status: UploadProgress["status"] | "queued";
  error?: string;
}

interface UploadContextValue {
  uploads: UploadItem[];
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  addUpload: (file: File, options?: { userOverride?: string; folder?: string; tags?: string[] }) => void;
  updateProgress: (id: string, progress: Partial<UploadItem>) => void;
  completeUpload: (id: string) => void;
  clearCompleted: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { refresh } = useIndex();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [minimized, setMinimized] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateProgress = useCallback((id: string, progress: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...progress } : u)));
  }, []);

  const completeUpload = useCallback((id: string) => {
    updateProgress(id, { status: "done" });
  }, [updateProgress]);

  const maybeAutoDismiss = useCallback(() => {
    setUploads((current) => {
      if (current.length === 0) return current;
      const allComplete = current.every((u) => u.status === "done" || u.status === "error");
      if (allComplete) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setUploads([]);
        }, 3000);
      }
      return current;
    });
  }, []);

  const addUpload = useCallback(
    (file: File, options?: { userOverride?: string; folder?: string; tags?: string[] }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploads((prev) => [
        ...prev,
        {
          id,
          fileName: file.name,
          totalChunks: 1,
          uploadedChunks: 0,
          status: "queued",
        },
      ]);

      void (async () => {
        try {
          updateProgress(id, { status: "hashing" });
          const result = await runUploadPipeline({
            file,
            userOverride: options?.userOverride,
            folder: options?.folder,
            tags: options?.tags,
            sessionCsrfToken: (session as unknown as { csrfToken?: string } | undefined)?.csrfToken,
            onProgress: (progress) => {
              updateProgress(id, {
                status: progress.status,
                totalChunks: progress.totalChunks,
                uploadedChunks: progress.uploadedChunks,
              });
            },
          });

          if (result.skipped) {
            updateProgress(id, { status: "done", hash: result.hash });
            maybeAutoDismiss();
            return;
          }

          const record: FileRecord = {
            hash: result.hash,
            name: file.name,
            node: result.nodeName,
            path: result.path,
            size: file.size,
            type: file.type || "application/octet-stream",
            tags: options?.tags ?? [],
            created: new Date().toISOString(),
            sync_status: "syncing",
            chunks: result.chunks.length > 1 ? result.chunks : undefined,
            iv: result.iv,
            encryptionKey: result.encryptionKey,
          };

          const completeRes = await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: [record] }),
          });
          if (!completeRes.ok) throw new Error("Upload commit failed");

          await enrichUploadedFileAction(result.hash, {
            folder: result.folder,
            thumbnail: result.thumbnail ?? undefined,
            starred: false,
            trashed: false,
          });

          await refresh(true);
          updateProgress(id, { status: "done", hash: result.hash, uploadedChunks: result.chunks.length });
          maybeAutoDismiss();
        } catch (err) {
          updateProgress(id, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      })();
    },
    [maybeAutoDismiss, refresh, session, updateProgress]
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== "done"));
  }, []);

  const value = useMemo<UploadContextValue>(
    () => ({
      uploads,
      minimized,
      setMinimized,
      addUpload,
      updateProgress,
      completeUpload,
      clearCompleted,
    }),
    [uploads, minimized, addUpload, updateProgress, completeUpload, clearCompleted]
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}
