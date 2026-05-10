"use client";

import { useCallback, useEffect, useState } from "react";
import type { DataNode, FileRecord, GitStoreIndex, UploadProgress } from "@/types";
import { runUploadPipeline } from "@/lib/upload";
import { loadIndex, populateCacheLayers, updateCacheAfterWrite } from "@/lib/cache";
import { DropZone } from "@/components/upload/DropZone";
import { UploadQueue } from "@/components/upload/UploadQueue";

interface QueueItem {
  id: string;
  file: File;
  progress: UploadProgress;
  result?: FileRecord;
  error?: string;
}

export default function UploadPage() {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [pendingRecords, setPendingRecords] = useState<FileRecord[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);

  // Load nodes on mount
  useEffect(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data: { nodes: DataNode[] }) => {
        setNodes(data.nodes ?? []);
        if (data.nodes?.length) setSelectedNode(data.nodes[0].id);
      })
      .catch(console.error);
  }, []);

  // Optimistically show files — update badge immediately
  const updateProgress = useCallback(
    (id: string, progress: UploadProgress) => {
      setQueue((q) =>
        q.map((item) => (item.id === id ? { ...item, progress } : item))
      );
    },
    []
  );

  const processFile = useCallback(
    async (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nodeInfo = nodes.find((n) => n.id === selectedNode);
      if (!nodeInfo) return;

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Add to queue immediately (optimistic)
      setQueue((q) => [
        ...q,
        {
          id,
          file,
          progress: {
            fileId: id,
            filename: file.name,
            totalChunks: 1,
            uploadedChunks: 0,
            status: "hashing",
          },
        },
      ]);

      try {
        const result = await runUploadPipeline({
          file,
          nodeRepo: nodeInfo.repo,
          nodeName: nodeInfo.id,
          tags: tagList,
          onProgress: (p) => updateProgress(id, { ...p, fileId: id }),
        });

        if (result.skipped) {
          setQueue((q) =>
            q.map((item) =>
              item.id === id
                ? {
                    ...item,
                    progress: { ...item.progress, status: "done" },
                    error: "Duplicate — already stored",
                  }
                : item
            )
          );
          return;
        }

        // Build FileRecord for index
        const record: FileRecord = {
          hash: result.hash,
          name: file.name,
          node: nodeInfo.id,
          path: result.path,
          size: file.size,
          type: file.type || "application/octet-stream",
          tags: tagList,
          created: new Date().toISOString(),
          sync_status: "syncing",
          chunks: result.chunks.length > 1 ? result.chunks : undefined,
        };

        setPendingRecords((prev) => [...prev, record]);
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? { ...item, progress: { ...item.progress, status: "indexing" }, result: record }
              : item
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? { ...item, progress: { ...item.progress, status: "error" }, error: msg }
              : item
          )
        );
      }
    },
    [nodes, selectedNode, tags, updateProgress]
  );

  const handleDrop = useCallback(
    (files: File[]) => {
      for (const file of files) void processFile(file);
    },
    [processFile]
  );

  // Commit pending records to index.json ONCE after all uploads
  const commitIndex = useCallback(async () => {
    if (pendingRecords.length === 0) return;
    setIsCommitting(true);

    try {
      const res = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: pendingRecords }),
      });

      if (!res.ok) throw new Error("Index commit failed");
      const data = await res.json() as { index: GitStoreIndex };

      // Update cache layers
      await updateCacheAfterWrite(data.index);
      await populateCacheLayers(data.index);

      // Mark all pending as synced
      setQueue((q) =>
        q.map((item) =>
          item.result
            ? { ...item, progress: { ...item.progress, status: "done" }, result: { ...item.result, sync_status: "synced" } }
            : item
        )
      );
      setPendingRecords([]);

      // Trigger background replication if backup configured
      const cached = await loadIndex();
      void cached; // accessed for side-effect
    } catch (err) {
      console.error("[upload] Index commit failed:", err);
    } finally {
      setIsCommitting(false);
    }
  }, [pendingRecords]);

  // Auto-commit when no files are still uploading
  useEffect(() => {
    const allDone =
      queue.length > 0 &&
      queue.every((item) =>
        item.progress.status === "done" ||
        item.progress.status === "error" ||
        item.progress.status === "indexing"
      );
    const hasIndexing = queue.some((item) => item.progress.status === "indexing");

    if (allDone && hasIndexing && pendingRecords.length > 0 && !isCommitting) {
      void commitIndex();
    }
  }, [queue, pendingRecords, isCommitting, commitIndex]);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Upload Files</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Files are chunked, deduplicated, and stored in your GitHub repos.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4">
        {/* Node selector */}
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
            Target Node
          </label>
          <select
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-lg text-sm text-gray-100 outline-none focus:border-emerald-500/50"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} ({n.size_mb.toFixed(1)} MB)
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
            Tags <span className="text-gray-600 normal-case">(comma-separated)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. work, 2024, report"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Drop zone */}
      <DropZone onDrop={handleDrop} disabled={!selectedNode} />

      {/* Upload queue */}
      {queue.length > 0 && (
        <UploadQueue
          items={queue.map((item) => ({
            id: item.id,
            filename: item.file.name,
            size: item.file.size,
            progress: item.progress,
            error: item.error,
          }))}
          isCommitting={isCommitting}
          onClear={() => setQueue([])}
        />
      )}
    </div>
  );
}
