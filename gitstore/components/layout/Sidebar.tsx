"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArchiveIcon,
  ClockIcon,
  CodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  HardDriveIcon,
  ImageIcon,
  MusicIcon,
  StarIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { useIndex } from "@/components/providers/IndexContext";
import { NODE_DEFINITIONS } from "@/lib/nodes";
import { NewButton } from "@/components/layout/NewButton";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ImageIcon,
  VideoIcon,
  MusicIcon,
  FileTextIcon,
  CodeIcon,
  FileIcon,
  ArchiveIcon,
  FolderIcon,
};

function NavItem({
  href,
  label,
  active,
  icon: Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
        active
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { index, loading } = useIndex();
  const params = useSearchParams();
  const router = useRouter();

  const view = params.get("view") ?? "";
  const node = params.get("node") ?? "";

  const nodes = Object.values(index?.nodes ?? {});
  const totalUsedGb = Object.values(index?.nodes ?? {}).reduce((sum, n) => sum + n.size_mb / 1024, 0);
  const usedPct = Math.min(100, (totalUsedGb / 250) * 100);

  return (
    <>
      <aside className="hidden h-screen w-60 flex-shrink-0 border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:flex md:flex-col">
        <div className="mb-4 px-2">
          <p className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">GitStore</p>
        </div>

        <div className="mb-4">
          <NewButton />
        </div>

        <nav className="space-y-1">
          <NavItem href="/dashboard" label="My Files" icon={HardDriveIcon} active={!view && !node} />
          <NavItem href="/dashboard?view=recent" label="Recent" icon={ClockIcon} active={view === "recent"} />
          <NavItem href="/dashboard?view=starred" label="Starred" icon={StarIcon} active={view === "starred"} />
          <NavItem href="/dashboard?view=trash" label="Trash" icon={Trash2Icon} active={view === "trash"} />
        </nav>

        <div className="my-4 border-t border-gray-200 dark:border-gray-800" />
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Storage</p>

        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {loading
            ? ["w-32", "w-28", "w-36", "w-24", "w-20"].map((w, idx) => (
                <div key={idx} className={`h-8 rounded-lg bg-gray-200 dark:bg-gray-800 ${w}`} />
              ))
            : nodes.map((n) => {
                const def = NODE_DEFINITIONS[n.id as keyof typeof NODE_DEFINITIONS] ?? NODE_DEFINITIONS.other;
                const Icon = ICONS[def.icon] ?? FolderIcon;
                const active = node === n.id;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => router.push(`/dashboard?node=${n.id}`)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{def.label}</span>
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {n.size_mb.toFixed(1)} MB
                    </span>
                  </button>
                );
              })}
        </div>

        <div className="mt-4 space-y-1 px-2">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{totalUsedGb.toFixed(2)} GB used</span>
            <span>250 GB</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-4 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:hidden">
        <Link href="/dashboard" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <HardDriveIcon className="h-4 w-4" />
          Files
        </Link>
        <Link href="/dashboard?view=recent" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <ClockIcon className="h-4 w-4" />
          Recent
        </Link>
        <Link href="/dashboard?view=starred" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <StarIcon className="h-4 w-4" />
          Starred
        </Link>
        <Link href="/dashboard?view=trash" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <Trash2Icon className="h-4 w-4" />
          Trash
        </Link>
      </nav>
    </>
  );
}
