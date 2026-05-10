"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { DataNode } from "@/types";
import {
  AlertTriangleIcon,
  DatabaseIcon,
  HardDriveIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";

interface QuickStatProps {
  label: string;
  value: string;
  sub?: string;
}

function QuickStat({ label, value, sub }: QuickStatProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

interface SettingsCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isDanger?: boolean;
}

function SettingsCard({ href, title, description, icon: Icon, isDanger }: SettingsCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-4 rounded-xl border p-5 transition ${
        isDanger
          ? "border-red-900/30 bg-red-950/10 hover:border-red-800/50 hover:bg-red-950/20"
          : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/60"
      }`}
    >
      <div className={`rounded-lg p-2.5 ${
        isDanger ? "bg-red-900/20" : "bg-gray-800"
      }`}>
        <Icon className={`h-5 w-5 ${isDanger ? "text-red-400" : "text-gray-400 group-hover:text-gray-200"}`} />
      </div>
      <div>
        <p className={`font-semibold ${isDanger ? "text-red-300" : "text-gray-100"}`}>{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
    </Link>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [nodes, setNodes] = useState<DataNode[]>([]);

  const loadNodes = useCallback(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((data: { nodes: DataNode[] }) => setNodes(data.nodes ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  const login = (session as unknown as { login?: string } | null)?.login ?? "—";
  const totalUsedMb = nodes.reduce((sum, n) => sum + n.size_mb, 0);
  const totalUsedGb = (totalUsedMb / 1024).toFixed(2);
  const nodeCount = nodes.length;

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your GitStore configuration, connected nodes, sync, and security.
        </p>
      </div>

      {/* ── Account summary ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-gray-800 p-2.5">
            <UserIcon className="h-5 w-5 text-gray-300" />
          </div>
          <div>
            <p className="font-semibold text-gray-100">@{login}</p>
            <p className="text-xs text-gray-500">GitHub account · GitStore owner</p>
          </div>
        </div>
      </section>

      {/* ── Quick stats ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <QuickStat label="Storage Used" value={`${totalUsedGb} GB`} sub="of 250 GB" />
        <QuickStat label="Connected Nodes" value={String(nodeCount)} sub="GitHub repos" />
        <QuickStat label="Plan" value="Free" sub="Unlimited files" />
      </div>

      {/* ── Settings sections ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Configuration</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsCard
            href="/settings/nodes"
            title="Connected Nodes"
            description="Manage GitHub repo nodes that store your files"
            icon={ServerIcon}
          />
          <SettingsCard
            href="/settings/storage"
            title="Storage"
            description="View storage usage across all data nodes"
            icon={HardDriveIcon}
          />
          <SettingsCard
            href="/settings/sync"
            title="Sync & Backup"
            description="Force sync index and configure backup accounts"
            icon={RefreshCwIcon}
          />
          <SettingsCard
            href="/settings/security"
            title="Security"
            description="Encryption, access tokens, and permissions"
            icon={ShieldIcon}
          />
          <SettingsCard
            href="/settings/cache"
            title="Cache"
            description="IndexedDB cache layers and local storage"
            icon={DatabaseIcon}
          />
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-300">Architecture</h2>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-500 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-800/50 p-3">
            <p className="font-semibold text-gray-300">Master Name Node</p>
            <p className="mt-0.5 font-mono text-emerald-500/80">gitstore-master</p>
            <p className="mt-1">Stores the full index.json with file metadata, hashes, and search index</p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-3">
            <p className="font-semibold text-gray-300">Secondary Name Node</p>
            <p className="mt-0.5 font-mono text-emerald-500/80">gitstore-secondary</p>
            <p className="mt-1">Mirrors index.json from master after every write for fault tolerance</p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-3">
            <p className="font-semibold text-gray-300">Data Nodes</p>
            <p className="mt-0.5 font-mono text-emerald-500/80">gitstore-[name]</p>
            <p className="mt-1">Actual file storage — one private repo per category</p>
          </div>
        </div>
      </section>

      {/* ── Danger zone (bottom, visually separated) ──────────────────────── */}
      <section className="pt-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex-1 border-t border-gray-800" />
        </div>
        <SettingsCard
          href="/settings/danger-zone"
          title="Danger Zone"
          description="Irreversible actions — permanently delete all GitStore data"
          icon={AlertTriangleIcon}
          isDanger
        />
      </section>
    </div>
  );
}
