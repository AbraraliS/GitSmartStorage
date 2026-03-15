"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileRecord, GitStoreIndex, FilterOptions } from "@/types";
import { loadIndex, populateCacheLayers } from "@/lib/cache";
import { searchFiles } from "@/lib/index";
import { FileCard } from "@/components/files/FileCard";
import { SearchBar } from "@/components/files/SearchBar";
import { FilterPanel } from "@/components/files/FilterPanel";
import { NodeBadge } from "@/components/files/NodeBadge";
import Link from "next/link";

export default function DashboardPage() {
  const [index, setIndex] = useState<GitStoreIndex | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterOptions>({});
  const [results, setResults] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  // Load index: L1 → L2 → L5 (GitHub API)
  const fetchIndex = useCallback(async (force = false) => {
    try {
      if (!force) {
        const cached = await loadIndex();
        if (cached) {
          setIndex(cached);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      const res = await fetch("/api/sync");
      if (!res.ok) throw new Error("Failed to fetch index");
      const data = await res.json() as { index: GitStoreIndex | null };

      if (data.index) {
        await populateCacheLayers(data.index);
        setIndex(data.index);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIndex();
  }, [fetchIndex]);

  // Re-run search whenever query, filters, or index changes
  useEffect(() => {
    if (!index) return;
    const found = searchFiles(index, query, filters);
    setResults(found);
  }, [index, query, filters]);

  // Virtual scroll
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  const handleDelete = useCallback(async (hash: string) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/files?hash=${hash}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await fetchIndex(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }, [fetchIndex]);

  // ── Bootstrap check: if no index, trigger bootstrap
  useEffect(() => {
    if (!loading && !index && !error) {
      fetch("/api/bootstrap", { method: "POST" })
        .then((r) => r.json())
        .then((data: { index?: GitStoreIndex }) => {
          if (data.index) {
            void populateCacheLayers(data.index);
            setIndex(data.index);
          }
        })
        .catch(console.error);
    }
  }, [loading, index, error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading your file index…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-red-400">
        <p className="font-semibold">Error loading index</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={() => fetchIndex(true)} className="mt-3 text-sm underline hover:text-red-300">
          Retry
        </button>
      </div>
    );
  }

  const totalFiles = Object.keys(index?.files ?? {}).length;
  const nodes = Object.values(index?.nodes ?? {});

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">File Browser</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalFiles} file{totalFiles !== 1 ? "s" : ""} across {nodes.length} node{nodes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload
        </Link>
      </div>

      {/* Node badges */}
      {nodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <NodeBadge
            label="All nodes"
            active={!filters.node}
            onClick={() => setFilters((f) => ({ ...f, node: undefined }))}
          />
          {nodes.map((n) => (
            <NodeBadge
              key={n.id}
              label={`${n.id} (${n.size_mb.toFixed(1)} MB)`}
              active={filters.node === n.id}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  node: f.node === n.id ? undefined : n.id,
                }))
              }
            />
          ))}
        </div>
      )}

      {/* Search + filter row */}
      <div className="flex gap-3">
        <SearchBar value={query} onChange={setQuery} />
        <FilterPanel filters={filters} onChange={setFilters} />
      </div>

      {/* Results count */}
      {query || filters.node || filters.type ? (
        <p className="text-sm text-gray-500">
          {results.length} result{results.length !== 1 ? "s" : ""}
          {query ? ` for "${query}"` : ""}
        </p>
      ) : null}

      {/* File list — virtualised */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-600">
          <svg className="w-12 h-12 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">
            {totalFiles === 0 ? "No files yet. Upload your first file!" : "No files match your search."}
          </p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto rounded-xl border border-gray-800"
          style={{ contain: "strict" }}
        >
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const file = results[virtualRow.index];
              return (
                <div
                  key={file.hash}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileCard file={file} onDelete={handleDelete} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
