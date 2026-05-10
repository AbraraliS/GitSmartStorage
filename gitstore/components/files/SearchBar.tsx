"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useIndex } from "@/components/providers/IndexContext";
import { searchFiles } from "@/lib/index";
import { formatBytes } from "@/lib/format";

export function SearchBar() {
  const { index } = useIndex();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const q = params.get("q") ?? "";

  const results = useMemo(() => {
    if (!index || !q.trim()) return [];
    return searchFiles(index, q).filter((f) => !f.trashed).slice(0, 8);
  }, [index, q]);

  return (
    <div className="relative w-full max-w-2xl">
      <label htmlFor="global-search" className="sr-only">
        Search files
      </label>
      <div className="flex items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
        <SearchIcon className="h-4 w-4 text-gray-400" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.value) next.set("q", e.target.value);
            else next.delete("q");
            router.replace(`${pathname}?${next.toString()}`);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          placeholder="Search in My Files"
        />
      </div>

      {open && q.trim() && (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No files match &quot;{q}&quot;</p>
          ) : (
            results.map((file) => (
              <button
                key={file.hash}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  next.delete("q");
                  const firstFolder = file.folders?.[0];
                  if (firstFolder) {
                    next.delete("node");
                    next.set("view", "folder");
                    next.set("path", firstFolder);
                  } else {
                    next.delete("view");
                    next.delete("path");
                    next.set("node", file.node);
                  }
                  router.push(`${pathname}?${next.toString()}`);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <span className="truncate text-gray-900 dark:text-gray-100">{file.name}</span>
                <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
