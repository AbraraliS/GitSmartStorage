"use client";

import { useCallback, useState } from "react";

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onDrop, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onDrop(files);
    },
    [disabled, onDrop]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onDrop(files);
      e.target.value = "";
    },
    [onDrop]
  );

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`block border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
        disabled
          ? "border-gray-800 opacity-50 cursor-not-allowed"
          : isDragging
          ? "border-emerald-500 bg-emerald-500/5"
          : "border-gray-700 hover:border-emerald-500/50 hover:bg-gray-900/40"
      }`}
    >
      <input
        type="file"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <svg
        className={`w-12 h-12 mx-auto mb-4 transition-colors ${
          isDragging ? "text-emerald-400" : "text-gray-600"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
      <p className="text-gray-300 font-medium">
        {isDragging ? "Drop files here" : "Drag & drop files or click to browse"}
      </p>
      <p className="text-xs text-gray-600 mt-2">
        Any format · Auto-chunked at 4 MB · SHA-256 deduplication
      </p>
      <p className="text-xs text-gray-700 mt-1">
        Under 100 MB → Repo · 100 MB–2 GB → Git LFS · Above 2 GB → Releases
      </p>
    </label>
  );
}
