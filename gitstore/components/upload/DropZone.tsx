"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadCloudIcon } from "lucide-react";
import { classifyFile } from "@/lib/nodes";
import { useUpload } from "@/components/providers/UploadContext";

export function DropZone({
  onDrop,
  disabled,
  showEmptyPrompt,
  currentFolder,
}: {
  onDrop?: (files: File[]) => void;
  disabled?: boolean;
  showEmptyPrompt?: boolean;
  currentFolder?: string;
}) {
  const { addUpload } = useUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const handleFiles = useCallback((files: File[]) => {
    if (disabled || files.length === 0) return;
    onDrop?.(files);
    for (const file of files) {
      const node = classifyFile(file.type || "application/octet-stream");
      addUpload(file, { userOverride: node, folder: currentFolder ?? "/" });
    }
  }, [addUpload, currentFolder, disabled, onDrop]);

  useEffect(() => {
    const openPicker = () => inputRef.current?.click();
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current += 1;
      if (!disabled) setDragOver(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
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

  const overlay = useMemo(
    () =>
      dragOver ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-blue-600/10">
          <div className="rounded-2xl border-2 border-dashed border-blue-500 bg-white/90 px-10 py-14 text-center dark:bg-gray-900/90">
            <UploadCloudIcon className="mx-auto h-10 w-10 text-blue-600" />
            <p className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Drop files anywhere</p>
          </div>
        </div>
      ) : null,
    [dragOver]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          handleFiles(files);
          event.currentTarget.value = "";
        }}
      />

      {showEmptyPrompt && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative z-10 flex w-full flex-col items-center rounded-xl border-2 border-dashed border-gray-300 py-12 text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-700 dark:text-gray-400"
        >
          <UploadCloudIcon className="h-10 w-10" />
          <p className="mt-3">Drop files here or click to upload</p>
        </button>
      )}

      {overlay}
    </>
  );
}
