"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloudIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";
import { isExternalFileDrag, getDroppedFiles } from "@/lib/drag-drop";

interface DropZoneProps {
  /** If set, drag-drop skips picker and uploads directly to this folder */
  targetFolder?: string;
  showEmptyPrompt?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * If provided, file drops call this callback instead of the context.
   * Used by upload/page.tsx which manages its own upload queue.
   */
  onDrop?: (files: File[]) => void;
}

/**
 * DropZone — global drag-to-upload handler.
 *
 * Activation rules (STRICT):
 *   ✅ External OS file drag (Finder, Explorer, browser download)
 *   ✅ dataTransfer.types contains "Files"
 *   ❌ Internal GitStore drag (tagged with application/x-gitstore-internal)
 *   ❌ Text selection drag
 *   ❌ Element dragging (rows, cards)
 *   ❌ Any drag not sourced from real File objects
 *
 * Drag-depth tracking:
 *   A ref counter (dragDepth) is incremented on dragenter and decremented
 *   on dragleave. The overlay only hides when depth reaches 0. This prevents
 *   the common "flickering" bug caused by nested child dragenter/dragleave
 *   events firing in rapid succession.
 */
export function DropZone({
  targetFolder,
  showEmptyPrompt,
  disabled,
  className,
  onDrop,
}: DropZoneProps) {
  const { uploadFiles, uploadFilesToFolder, triggerUpload } = useUpload();
  const [dragOver, setDragOver] = useState(false);
  // Counter prevents flicker from nested dragenter/dragleave pairs
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      if (onDrop) {
        onDrop(files);
        return;
      }
      if (targetFolder !== undefined) {
        uploadFilesToFolder(files, targetFolder);
      } else {
        uploadFiles(files); // shows folder picker
      }
    },
    [disabled, onDrop, targetFolder, uploadFiles, uploadFilesToFolder]
  );

  useEffect(() => {
    const onNewUpload = (e: Event) => {
      const customEvent = e as CustomEvent<{ folder?: string }>;
      const folder = customEvent.detail?.folder ?? targetFolder;
      if (!disabled) triggerUpload({ targetFolder: folder });
    };

    const onDragEnter = (e: DragEvent) => {
      // ── GUARD: only react to real external file drags ──────────────────
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current++;
      if (!disabled) setDragOver(true);
    };

    const onDragLeave = (e: DragEvent) => {
      // Only decrement if we were tracking this drag
      if (dragDepth.current === 0) return;
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };

    const onDragOver = (e: DragEvent) => {
      // ── GUARD: only intercept real external file drags ─────────────────
      // This also prevents browser navigation if a non-file is dragged over
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
    };

    const onDropEvent = (e: DragEvent) => {
      // Always reset depth and hide overlay
      dragDepth.current = 0;
      setDragOver(false);

      // ── GUARD: reject internal drags and non-file drags ────────────────
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();

      const files = getDroppedFiles(e);
      handleFiles(files);
    };

    // dragend fires when the user releases outside the window (e.g. cancelled drag)
    // Reset overlay state to prevent it getting stuck
    const onDragEnd = () => {
      dragDepth.current = 0;
      setDragOver(false);
    };

    window.addEventListener("gitstore:new-upload", onNewUpload);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDropEvent);
    window.addEventListener("dragend", onDragEnd);

    return () => {
      window.removeEventListener("gitstore:new-upload", onNewUpload);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDropEvent);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, [disabled, handleFiles, targetFolder, triggerUpload]);

  return (
    <>
      {showEmptyPrompt && (
        <button
          type="button"
          onClick={() => triggerUpload({ targetFolder })}
          className={`relative z-10 hidden md:flex w-full flex-col items-center rounded-xl border-2 border-dashed border-gray-700 py-12 text-gray-500 transition hover:border-emerald-500/50 hover:text-emerald-500 ${className ?? ""}`}
        >
          <UploadCloudIcon className="h-10 w-10" />
          <p className="mt-3 text-sm font-medium">
            {targetFolder && targetFolder !== "/"
              ? `Drop files here to upload to "${targetFolder.split("/").pop()}"`
              : "Drop files here or click to upload"}
          </p>
          {targetFolder && targetFolder !== "/" && (
            <p className="mt-1 text-xs text-gray-600">
              Files will be saved to {targetFolder}
            </p>
          )}
        </button>
      )}

      {/*
        Full-page drag overlay — only visible for real external file drags.
        pointer-events-none so it doesn't interfere with dragleave detection.
        aria-hidden so screen readers ignore the decorative overlay.
      */}
      {dragOver && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-emerald-500/5"
        >
          <div className="rounded-2xl border-2 border-dashed border-emerald-500 bg-gray-950/90 px-12 py-14 text-center shadow-2xl shadow-emerald-500/10">
            <UploadCloudIcon className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-3 text-lg font-semibold text-gray-100">
              Drop files to upload
            </p>
            {targetFolder && targetFolder !== "/" ? (
              <p className="mt-1 text-sm text-emerald-400">→ {targetFolder}</p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                You&apos;ll choose the folder next
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}