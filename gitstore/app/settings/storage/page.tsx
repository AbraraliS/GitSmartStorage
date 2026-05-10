"use client";

import { useCallback, useEffect, useState } from "react";
import type { DataNode } from "@/types";
import { HardDriveIcon } from "lucide-react";

export default function StoragePage() {
  const [nodes, setNodes] = useState<DataNode[]>([]);

  const loadNodes = useCallback(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data: { nodes: DataNode[] }) => setNodes(data.nodes ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  const totalMb = nodes.reduce((sum, n) => sum + n.size_mb, 0);
  const totalGb = (totalMb / 1024).toFixed(2);
  const limitGb = 250;
  const usedPct = Math.min(100, (Number(totalGb) / limitGb) * 100);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Storage</h1>
        <p className="mt-1 text-sm text-gray-500">
          Storage is distributed across GitHub repository nodes. Each node can hold up to ~1 GB.
        </p>
      </div>

      {/* Overall usage */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-100">Total Usage</h2>
          <span className="text-sm text-gray-400">{totalGb} GB / {limitGb} GB</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all ${
              usedPct > 80 ? "bg-red-500" : usedPct > 60 ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">{usedPct.toFixed(1)}% used</p>
      </section>

      {/* Per-node breakdown */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <h2 className="font-semibold text-gray-100">Storage by Node</h2>
        {nodes.length === 0 ? (
          <p className="text-sm text-gray-500">No nodes connected yet.</p>
        ) : (
          <div className="space-y-3">
            {nodes
              .sort((a, b) => b.size_mb - a.size_mb)
              .map((node) => {
                const nodeGb = (node.size_mb / 1024).toFixed(3);
                const nodePct = totalMb > 0 ? (node.size_mb / totalMb) * 100 : 0;
                return (
                  <div key={node.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <HardDriveIcon className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-gray-200">{node.id}</span>
                      </div>
                      <span className="text-gray-400">{node.size_mb.toFixed(1)} MB ({nodePct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full bg-blue-500/70"
                        style={{ width: `${nodePct}%` }}
                      />
                    </div>
                    <p className="font-mono text-[11px] text-gray-600">{node.repo}</p>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
