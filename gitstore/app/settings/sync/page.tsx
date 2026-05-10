"use client";

import { useState } from "react";
import { RefreshCwIcon, ExternalLinkIcon } from "lucide-react";
import { MobileHeader } from "@/components/layout/MobileHeader";

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [backupToken, setBackupToken] = useState("");
  const [backupLogin, setBackupLogin] = useState("");
  const [replicating, setReplicating] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json() as { ok: boolean; synced_at: string };
      setSyncStatus(`Synced at ${new Date(data.synced_at).toLocaleTimeString()}`);
    } catch {
      setSyncStatus("Sync failed — check console for details");
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
    <div className="max-w-2xl space-y-6">
      <MobileHeader title="Sync & Backup" backHref="/settings" />
      <div>
        <h1 className="text-xl font-bold text-gray-100">Sync & Backup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Force-sync the master index and configure cross-account backup replication.
        </p>
      </div>

      {/* Index Sync */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-100">Index Sync</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Force-sync the master index.json to the secondary name-node repo.
            This happens automatically after every write, but you can trigger it manually.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50 transition"
          >
            <RefreshCwIcon className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          {syncStatus && <p className="text-xs text-emerald-400">{syncStatus}</p>}
        </div>
      </section>

      {/* Backup account */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-100">Backup GitHub Account</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Replicate all data nodes to a second GitHub account for fault tolerance.
            Generate a Personal Access Token with{" "}
            <code className="text-emerald-400">repo</code> scope on the backup account.
          </p>
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            Generate token <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Backup GitHub username"
            value={backupLogin}
            onChange={(e) => setBackupLogin(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50 hover:border-gray-600"
          />
          <input
            type="password"
            placeholder="Backup GitHub Personal Access Token"
            value={backupToken}
            onChange={(e) => setBackupToken(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50 hover:border-gray-600"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={triggerBackup}
            disabled={replicating || !backupToken || !backupLogin}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50 transition"
          >
            {replicating ? "Replicating…" : "Replicate to Backup"}
          </button>
          {backupStatus && <p className="text-xs text-emerald-400">{backupStatus}</p>}
        </div>

        <p className="text-xs text-gray-600">
          ⚠️ The token is sent to your own server-side API route — it is never stored by GitStore.
        </p>
      </section>
    </div>
  );
}
