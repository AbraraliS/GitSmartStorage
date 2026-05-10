"use client";

import { useCallback, useEffect, useState } from "react";
import type { DataNode } from "@/types";
import { PlusIcon, ServerIcon } from "lucide-react";
import { MobileHeader } from "@/components/layout/MobileHeader";

export default function NodesPage() {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [newNodeName, setNewNodeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNodes = useCallback(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data: { nodes: DataNode[] }) => setNodes(data.nodes ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  const createNode = async () => {
    if (!newNodeName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newNodeName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }
      setNewNodeName("");
      loadNodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create node");
    } finally {
      setLoading(false);
    }
  };

  const totalMb = nodes.reduce((sum, n) => sum + n.size_mb, 0);

  return (
    <div className="max-w-2xl space-y-6">
      <MobileHeader title="Connected Nodes" backHref="/settings" />
      <div>
        <h1 className="text-xl font-bold text-gray-100">Connected Nodes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Each node maps to a private GitHub repository in your account.
          Files are distributed across nodes for scalability.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Nodes</p>
          <p className="mt-1 text-2xl font-bold text-gray-100">{nodes.length}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Used</p>
          <p className="mt-1 text-2xl font-bold text-gray-100">{(totalMb / 1024).toFixed(2)} GB</p>
        </div>
      </div>

      {/* Node list */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h2 className="font-semibold text-gray-100">Nodes</h2>
        <div className="space-y-2">
          {nodes.map((node) => {
            const pct = Math.min(100, (node.size_mb / 900) * 100); // ~900 MB per repo safe limit
            return (
              <div key={node.id} className="rounded-lg bg-gray-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ServerIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-100">{node.id}</span>
                  </div>
                  <span className="text-xs text-gray-400">{node.size_mb.toFixed(2)} MB</span>
                </div>
                <p className="font-mono text-xs text-emerald-500/80">{node.repo}</p>
                <div className="h-1 rounded-full bg-gray-700">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {nodes.length === 0 && (
            <p className="text-sm text-gray-500">No nodes yet. Create your first node below.</p>
          )}
        </div>

        {/* Create node */}
        <div className="flex gap-2 pt-2">
          <input
            type="text"
            placeholder="Node name (e.g. photos, documents)"
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createNode(); }}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50 hover:border-gray-600"
          />
          <button
            onClick={createNode}
            disabled={loading || !newNodeName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            <PlusIcon className="h-4 w-4" />
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
