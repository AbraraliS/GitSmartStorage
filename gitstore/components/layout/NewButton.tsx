"use client";

import { PlusIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";

export function NewButton() {
  const { triggerUpload } = useUpload();

  return (
    <button
      type="button"
      onClick={() => triggerUpload()}
      className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <span className="flex items-center justify-center gap-2">
        <PlusIcon className="h-4 w-4" />
        New
      </span>
    </button>
  );
}
