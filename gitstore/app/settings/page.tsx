"use client";

import { useCallback, useEffect, useState } from "react";
import type { DataNode } from "@/types";

export default function SettingsPage() {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [newNodeName, setNewNodeName] = useState("");
  const [nodeLoading, setNodeLoading] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  const [backupToken, setBackupToken] = useState("");
  const [backupLogin, setBackupLogin] = useState("");
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [replicating, setReplicating] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const loadNodes = useCallback(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data: { nodes: DataNode[] }) => setNodes(data.nodes ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const createNode = async () => {
    if (!newNodeName.trim()) return;
    setNodeLoading(true);
    setNodeError(null);
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
      setNodeError(err instanceof Error ? err.message : "Failed to create node");
    } finally {
      setNodeLoading(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json() as { ok: boolean; synced_at: string };
      setSyncStatus(`Synced at ${new Date(data.synced_at).toLocaleTimeString()}`);
    } catch {
      setSyncStatus("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const triggerBackup = async () => {
    if (!backupToken || !backupLogin) return;
    setReplicating(true);
    setBackupStatus(null);
    try {
      const res = await fetch("/api/sync/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupToken, backupLogin }),
      });
      const data = await res.json() as { ok: boolean; replicated: number };
      setBackupStatus(`Replicated ${data.replicated} files to @${backupLogin}`);
    } catch {
      setBackupStatus("Replication failed");
    } finally {
      setReplicating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage data nodes, sync, and backup configuration.
        </p>
      </div>

      {/* ─── Data Nodes ─── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-100">Data Nodes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Each node maps to a private GitHub repository in your account.
          </p>
        </div>

        {/* Existing nodes */}
        <div className="space-y-2">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg"
            >
              <div>
                <p className="text-sm font-medium text-gray-100">{node.id}</p>
                <p className="text-xs text-gray-500">{node.repo}</p>
              </div>
              <span className="text-xs text-gray-400">{node.size_mb.toFixed(2)} MB</span>
            </div>
          ))}
          {nodes.length === 0 && (
            <p className="text-sm text-gray-600">No nodes yet.</p>
          )}
        </div>

        {/* Create new node */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Node name (e.g. photos)"
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createNode(); }}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 focus:border-emerald-500/50 rounded-lg text-sm text-gray-100 placeholder-gray-600 outline-none"
          />
          <button
            onClick={createNode}
            disabled={nodeLoading || !newNodeName.trim()}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-gray-950 font-semibold rounded-lg text-sm transition-colors"
          >
            {nodeLoading ? "Creating…" : "Create"}
          </button>
        </div>
        {nodeError && <p className="text-xs text-red-400">{nodeError}</p>}
      </section>

      {/* ─── Index Sync ─── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-100">Index Sync</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Force-sync the master index.json to the secondary name-node repo.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-200 font-medium rounded-lg text-sm transition-colors"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          {syncStatus && <p className="text-xs text-emerald-400">{syncStatus}</p>}
        </div>
      </section>

      {/* ─── Backup Account ─── */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-100">Backup GitHub Account</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Optionally replicate all data nodes to a second GitHub account for fault tolerance.
            Generate a Personal Access Token with <code className="text-emerald-400">repo</code> scope.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Backup GitHub username"
            value={backupLogin}
            onChange={(e) => setBackupLogin(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 focus:border-emerald-500/50 rounded-lg text-sm text-gray-100 placeholder-gray-600 outline-none"
          />
          <input
            type="password"
            placeholder="Backup GitHub Personal Access Token"
            value={backupToken}
            onChange={(e) => setBackupToken(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 focus:border-emerald-500/50 rounded-lg text-sm text-gray-100 placeholder-gray-600 outline-none"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={triggerBackup}
            disabled={replicating || !backupToken || !backupLogin}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-200 font-medium rounded-lg text-sm transition-colors"
          >
            {replicating ? "Replicating…" : "Replicate to Backup"}
          </button>
          {backupStatus && <p className="text-xs text-emerald-400">{backupStatus}</p>}
        </div>

        <p className="text-xs text-gray-600">
          ⚠️ The token is sent to your own server-side API route — it is never stored by GitStore.
        </p>
      </section>

      {/* ─── Architecture note ─── */}
      <section className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-5">
        <h2 className="font-semibold text-gray-300 mb-3 text-sm">Architecture</h2>
        <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="font-semibold text-gray-300 mb-1">Master Name Node</p>
            <p className="font-mono text-emerald-500/80">gitstore-master</p>
            <p className="mt-1">Stores the full index.json with file metadata, hashes, search index</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="font-semibold text-gray-300 mb-1">Secondary Name Node</p>
            <p className="font-mono text-emerald-500/80">gitstore-secondary</p>
            <p className="mt-1">Mirrors index.json from master after every write for fault tolerance</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="font-semibold text-gray-300 mb-1">Data Nodes</p>
            <p className="font-mono text-emerald-500/80">gitstore-[name]</p>
            <p className="mt-1">Actual file storage — one private repo per category</p>
          </div>
        </div>
      </section>
    </div>
  );
}
