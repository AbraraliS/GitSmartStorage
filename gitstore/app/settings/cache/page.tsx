"use client";

import { useState } from "react";
import { DatabaseIcon, Trash2Icon } from "lucide-react";

export default function CachePage() {
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const clearAllCaches = async () => {
    setClearing(true);
    setStatus(null);
    try {
      // Clear IndexedDB
      const dbs = await indexedDB.databases?.() ?? [];
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      // Clear localStorage keys
      const keysToRemove = Object.keys(localStorage).filter(
        (k) => k.startsWith("gitstore:")
      );
      for (const key of keysToRemove) localStorage.removeItem(key);

      setStatus("All caches cleared. Refresh to reload from GitHub.");
    } catch {
      setStatus("Cache clear failed — try refreshing the page.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Cache</h1>
        <p className="mt-1 text-sm text-gray-500">
          GitStore uses a 5-layer local cache (L1–L5) to minimize GitHub API calls.
        </p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h2 className="font-semibold text-gray-100">Cache Architecture</h2>
        <div className="space-y-2 text-xs text-gray-500">
          {[
            { layer: "L1", name: "In-memory (React state)", desc: "Lost on page refresh. Fastest." },
            { layer: "L2", name: "IndexedDB", desc: "Persists across sessions. Survives refresh." },
            { layer: "L3", name: "localStorage", desc: "Fast JSON cache for small metadata." },
            { layer: "L4", name: "sessionStorage", desc: "Tab-scoped cache for active session." },
            { layer: "L5", name: "GitHub Remote", desc: "Source of truth. Slowest (network)." },
          ].map(({ layer, name, desc }) => (
            <div key={layer} className="flex items-start gap-3 rounded-lg bg-gray-800 p-3">
              <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">{layer}</span>
              <div>
                <p className="font-medium text-gray-300">{name}</p>
                <p className="mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <DatabaseIcon className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-100">Clear All Caches</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Wipes L1–L4. The next page load will fetch fresh data from GitHub (L5).
              Use this to resolve stale UI or sync issues.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={clearAllCaches}
            disabled={clearing}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition"
          >
            <Trash2Icon className="h-4 w-4" />
            {clearing ? "Clearing…" : "Clear Cache"}
          </button>
          {status && <p className="text-xs text-emerald-400">{status}</p>}
        </div>
      </section>
    </div>
  );
}
