"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  HardDriveIcon,
  ImageIcon,
  MusicIcon,
  MoreVerticalIcon,
  FolderInputIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import {
  createFolderAction,
  deleteFolderAction,
  moveFolderAction,
  renameFolderAction,
  toggleFolderStarAction,
} from "@/app/dashboard/actions";
import { NewButton } from "@/components/layout/NewButton";
import { useIndex } from "@/components/providers/IndexContext";
import { getFolderStats, getSubFoldersOf } from "@/lib/index";
import { NODE_DEFINITIONS } from "@/lib/nodes";

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

function SectionHeader({
  title,
  collapsed,
  onToggle,
  extra,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
      >
        {collapsed ? <ChevronRightIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
        {title}
      </button>
      {extra}
    </div>
  );
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Number(year), Number(month) - 1, 1)
  );
}

export function Sidebar() {
  const { index, loading, setIndex } = useIndex();
  const params = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseHydrated, setCollapseHydrated] = useState(false);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

  const view = params.get("view") ?? "";
  const node = params.get("node") ?? "";
  const activePath = params.get("path") ?? "";
  const smartType = params.get("type") ?? "";
  const smartValue = params.get("value") ?? "";

  const nodes = Object.values(index?.nodes ?? {});
  const totalUsedGb = Object.values(index?.nodes ?? {}).reduce((sum, item) => sum + item.size_mb / 1024, 0);
  const usedPct = Math.min(100, (totalUsedGb / 250) * 100);

  const safeIndex = useMemo(
    () =>
      index ?? {
        files: {},
        nodes: {},
        search_index: {},
        folders: {},
        repoShards: {},
        updated_at: "",
        version: 2,
      },
    [index]
  );

  const rootFolders = useMemo(() => getSubFoldersOf(safeIndex, "/"), [safeIndex]);

  const nodeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const file of Object.values(index?.files ?? {})) {
      if (file.trashed) continue;
      counts[file.node] = (counts[file.node] ?? 0) + 1;
    }
    return counts;
  }, [index]);

  const months = useMemo(() => {
    const values = new Set<string>();
    for (const file of Object.values(index?.files ?? {})) {
      if (file.trashed) continue;
      values.add(file.created.slice(0, 7));
    }
    return Array.from(values).sort().reverse();
  }, [index]);

  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const file of Object.values(index?.files ?? {})) {
      if (file.trashed) continue;
      for (const tag of file.tags) values.add(tag);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [index]);

  useEffect(() => {
    const raw = window.localStorage.getItem("gitstore:sidebar-collapsed");
    if (!raw) {
      setCollapseHydrated(true);
      return;
    }

    try {
      setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      window.localStorage.removeItem("gitstore:sidebar-collapsed");
    } finally {
      setCollapseHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!collapseHydrated) return;
    window.localStorage.setItem("gitstore:sidebar-collapsed", JSON.stringify(collapsed));
  }, [collapsed, collapseHydrated]);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const toggleCollapsed = (key: string) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };

  const sectionCollapsed = {
    defaults: collapsed.defaults ?? false,
    folders: collapsed.folders ?? false,
    smart: collapsed.smart ?? false,
  };

  const openFolderMenuAt = (folderPath: string, x: number, y: number) => {
    setMenu({ path: folderPath, x, y });
  };

  const renderFolderTree = (
    children = rootFolders,
    depth = 0
  ): React.ReactNode => {
    if (children.length === 0) return null;

    return children.map((folder) => {
      const stats = getFolderStats(safeIndex, folder.path);
      const itemKey = `folder:${folder.path}`;
      const isCollapsed = collapsed[itemKey] ?? false;
      const hasChildren = getSubFoldersOf(safeIndex, folder.path).length > 0;
      const isActive = view === "folder" && activePath === folder.path;

      return (
        <div key={folder.path}>
          <div
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm ${
              isActive
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
            style={{ marginLeft: `${depth * 14}px` }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ path: folder.path, x: event.clientX, y: event.clientY });
            }}
          >
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => hasChildren && toggleCollapsed(itemKey)}
              aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
            >
              {hasChildren ? (
                isCollapsed ? <ChevronRightIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />
              ) : (
                <span className="inline-block h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard?view=folder&path=${encodeURIComponent(folder.path)}`)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1 text-left"
            >
              <span className="flex items-center gap-1 truncate">
                <span className="truncate">{folder.name}</span>
                {folder.starred && <StarIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {stats.fileCount}
              </span>
            </button>
            <button
              type="button"
              className="rounded p-1 opacity-0 transition-opacity hover:bg-gray-200 group-hover:opacity-100 dark:hover:bg-gray-700"
              onClick={(event) => {
                const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                openFolderMenuAt(folder.path, rect.left, rect.bottom + 4);
              }}
              aria-label="Folder options"
            >
              <MoreVerticalIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {!isCollapsed && renderFolderTree(getSubFoldersOf(safeIndex, folder.path), depth + 1)}
        </div>
      );
    });
  };

  return (
    <>
      <aside className="hidden h-screen w-72 flex-shrink-0 border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:flex md:flex-col">
        <div className="mb-4 px-2">
          <p className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">GitStore</p>
        </div>

        <div className="mb-4">
          <NewButton />
        </div>

        <nav className="space-y-1">
          <NavItem href="/dashboard?view=folder" label="My Files" icon={HardDriveIcon} active={!node && (!view || view === "folder")} />
          <NavItem href="/dashboard?view=recent" label="Recent" icon={ClockIcon} active={view === "recent"} />
          <NavItem href="/dashboard?view=trash" label="Trash" icon={Trash2Icon} active={view === "trash"} />
        </nav>

        <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <section className="space-y-2">
            <SectionHeader title="Default" collapsed={sectionCollapsed.defaults} onToggle={() => toggleCollapsed("defaults")} />
            {!sectionCollapsed.defaults && (
              <div className="space-y-1">
                {loading
                  ? ["w-32", "w-28", "w-36"].map((width, indexKey) => (
                      <div key={indexKey} className={`h-8 rounded-lg bg-gray-200 dark:bg-gray-800 ${width}`} />
                    ))
                  : nodes.map((entry) => {
                      const def = NODE_DEFINITIONS[entry.id as keyof typeof NODE_DEFINITIONS] ?? NODE_DEFINITIONS.other;
                      const Icon = ICONS[def.icon] ?? FolderIcon;
                      const active = node === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => router.push(`/dashboard?node=${entry.id}`)}
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
                            {nodeCounts[entry.id] ?? 0}
                          </span>
                        </button>
                      );
                    })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeader
              title="My Folders"
              collapsed={sectionCollapsed.folders}
              onToggle={() => toggleCollapsed("folders")}
              extra={
                <button
                  type="button"
                  className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  onClick={async () => {
                    const nextPath = window.prompt("Create folder", "New Folder");
                    if (!nextPath?.trim()) return;
                    const defaultNode = activePath
                      ? index?.folders?.[activePath]?.node ?? node ?? "documents"
                      : node || "documents";
                    const next = await createFolderAction(nextPath.trim(), activePath || "/", defaultNode);
                    await setIndex(next);
                  }}
                  aria-label="Create folder"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              }
            />
            {!sectionCollapsed.folders && <div className="space-y-1">{renderFolderTree(rootFolders, 0)}</div>}
          </section>

          <section className="space-y-2">
            <SectionHeader title="Smart" collapsed={sectionCollapsed.smart} onToggle={() => toggleCollapsed("smart")} />
            {!sectionCollapsed.smart && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=smart&type=starred&value=1")}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                    view === "smart" && smartType === "starred"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  <StarIcon className="h-4 w-4" />
                  Starred
                </button>
                {months.map((month) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => router.push(`/dashboard?view=smart&type=month&value=${encodeURIComponent(month)}`)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                      view === "smart" && smartType === "month" && smartValue === month
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <ClockIcon className="h-4 w-4" />
                    <span className="truncate">{formatMonth(month)}</span>
                  </button>
                ))}
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => router.push(`/dashboard?view=smart&type=tag&value=${encodeURIComponent(tag)}`)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                      view === "smart" && smartType === "tag" && smartValue === tag
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="text-xs font-semibold text-gray-400">#</span>
                    <span className="truncate">{tag}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
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

      {menu && (
        <div
          className="fixed z-[125] min-w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={async () => {
              const currentPath = menu.path;
              setMenu(null);
              const currentName = currentPath.split("/").filter(Boolean).at(-1) ?? currentPath;
              const nextValue = window.prompt("Rename folder", currentName);
              if (!nextValue?.trim()) return;
              const result = await renameFolderAction(currentPath, nextValue.trim());
              await setIndex(result.index);
              if (activePath === currentPath) {
                router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
              }
            }}
          >
            <span className="inline-flex items-center gap-2">
              <PencilIcon className="h-4 w-4" />
              Rename
            </span>
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={async () => {
              const currentPath = menu.path;
              setMenu(null);
              const currentFolder = safeIndex.folders?.[currentPath];
              const defaultParent = currentFolder?.parent ?? "/";
              const nextParent = window.prompt("Move folder to path (leave empty for root)", defaultParent);
              if (nextParent === null) return;
              const result = await moveFolderAction(currentPath, nextParent.trim() || "/");
              await setIndex(result.index);
              if (activePath === currentPath) {
                router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
              }
            }}
          >
            <span className="inline-flex items-center gap-2">
              <FolderInputIcon className="h-4 w-4" />
              Move to...
            </span>
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={async () => {
              const currentPath = menu.path;
              setMenu(null);
              const next = await toggleFolderStarAction(currentPath);
              await setIndex(next);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <StarIcon className="h-4 w-4" />
              {(safeIndex.folders?.[menu.path]?.starred ?? false) ? "Unstar" : "Star"}
            </span>
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("gitstore:new-upload", { detail: { folder: menu.path } }));
              setMenu(null);
            }}
          >
            Add files
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={async () => {
              const currentPath = menu.path;
              setMenu(null);
              const currentName = currentPath.split("/").filter(Boolean).at(-1) ?? currentPath;
              const confirmed = window.confirm(
                `Delete folder "${currentName}"?\n\nFiles inside will NOT be deleted - they will move back to the default directory.`
              );
              if (!confirmed) return;
              const next = await deleteFolderAction(currentPath);
              await setIndex(next);
              if (activePath === currentPath) {
                router.replace("/dashboard");
              }
            }}
          >
            Delete folder
          </button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-4 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:hidden">
        <Link href="/dashboard?view=folder" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <HardDriveIcon className="h-4 w-4" />
          Files
        </Link>
        <Link href="/dashboard?view=recent" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
          <ClockIcon className="h-4 w-4" />
          Recent
        </Link>
        <Link href="/dashboard?view=smart&type=starred&value=1" className="flex flex-col items-center justify-center text-xs text-gray-600 dark:text-gray-300">
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
