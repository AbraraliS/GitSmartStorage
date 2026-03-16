"use client";

import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";

export function NewButton() {
  const params = useSearchParams();
  const view = params.get("view") ?? "";
  const folderPath = params.get("path") ?? "/";
  const node = params.get("node") ?? "";
  const uploadFolder = view === "folder" ? folderPath : "/";
  const destinationLabel = uploadFolder !== "/"
    ? uploadFolder
    : node
      ? `${node} root`
      : "root";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("gitstore:new-upload", { detail: { folder: uploadFolder } }))}
        className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <span className="flex items-center justify-center gap-2">
          <PlusIcon className="h-4 w-4" />
          New
        </span>
      </button>
      <p className="px-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
        Upload here: {destinationLabel}
      </p>
    </div>
  );
}
