"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloudIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";

interface DropZoneProps {
  /** If set, skip folder picker and upload directly to this folder */
  targetFolder?: string;
  disabled?: boolean;
  /** Show a visible drop area (for empty folder states) */
  showEmptyPrompt?: boolean;
  className?: string;
}

export function DropZone({
  targetFolder,
  disabled,
  showEmptyPrompt,
  className,
}: DropZoneProps) {
  const { addFiles, addFilesToFolder } = useUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;

      if (targetFolder !== undefined) {
        // We know the target — skip picker
        addFilesToFolder(files, targetFolder);
      } else {
        // Show folder picker
        addFiles(files);
      }
    },
    [addFiles, addFilesToFolder, disabled, targetFolder]
  );

  useEffect(() => {
    const openPicker = () => {
      if (!disabled) inputRef.current?.click();
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current += 1;
      if (!disabled) setDragOver(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      handleFiles(files);
    };

    window.addEventListener("gitstore:new-upload", openPicker);
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("gitstore:new-upload", openPicker);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [disabled, handleFiles]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          handleFiles(files);
          e.currentTarget.value = "";
        }}
      />

      {showEmptyPrompt && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`relative z-10 flex w-full flex-col items-center rounded-xl border-2 border-dashed border-gray-700 py-12 text-gray-500 transition hover:border-emerald-500/50 hover:text-emerald-500 ${className ?? ""}`}
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

      {/* Full-page drag overlay */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-emerald-500/5">
          <div className="rounded-2xl border-2 border-dashed border-emerald-500 bg-gray-950/90 px-12 py-14 text-center shadow-2xl shadow-emerald-500/10">
            <UploadCloudIcon className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-3 text-lg font-semibold text-gray-100">
              Drop to upload
            </p>
            {targetFolder && targetFolder !== "/" ? (
              <p className="mt-1 text-sm text-emerald-400">
                → {targetFolder}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                You'll choose the folder next
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}