"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  HardDriveIcon,
  ImageIcon,
  LockIcon,
  MoreVerticalIcon,
  MusicIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  UploadCloudIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import {
  deleteFolderAction,
  moveFolderAction,
  renameFolderAction,
  toggleFolderStarAction,
} from "@/app/dashboard/actions";
import { NewButton } from "@/components/layout/NewButton";
import { useIndex } from "@/components/providers/IndexContext";
import { useUpload } from "@/components/providers/UploadContext";
import { useSidebar } from "@/components/providers/SidebarContext";
import { getFolderStats } from "@/lib/index";
import { buildFileTree } from "@/lib/filesystem";
import { getActiveSmartCollections } from "@/lib/smart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RenameDialog } from "@/components/ui/RenameDialog";
import { MoveDialog } from "@/components/ui/MoveDialog";

const SMART_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ImageIcon,
  VideoIcon,
  MusicIcon,
  FileTextIcon,
  BookOpenIcon,
  CodeIcon,
  ArchiveIcon,
  PaletteIcon,
  ClockIcon,
  StarIcon,
  HardDriveIcon,
  LockIcon,
};

function NavItem({
  href,
  label,
  active,
  icon: Icon,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
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

export function Sidebar() {
  const { index, loading, setIndex } = useIndex();
  const { triggerUpload } = useUpload();
  const { isOpen, close } = useSidebar();
  const params = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseHydrated, setCollapseHydrated] = useState(false);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

  // ── Modal state ─────────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ path: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  const view = params.get("view") ?? "";
  const activePath = params.get("path") ?? "";
  const smartType = params.get("type") ?? "";

  // Close drawer on route change
  useEffect(() => { close(); }, [params, close]);

  const totalUsedGb = Object.values(index?.nodes ?? {}).reduce(
    (sum, item) => sum + item.size_mb / 1024,
    0
  );
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

  const fileTree = useMemo(() => buildFileTree(safeIndex), [safeIndex]);

  const rootFolders = useMemo(() => {
    return fileTree.rootChildren
      .map((p) => fileTree.nodes.get(p))
      .filter((n) => n?.type === "folder")
      .map((n) => ({
        id: n!.path,
        name: n!.name,
        path: n!.path,
        parent: n!.parentPath ?? "/",
        created: n!.createdAt,
        starred: n!.type === "folder" ? n.starred : undefined,
      }));
  }, [fileTree]);

  const smartCollections = useMemo(
    () => getActiveSmartCollections(safeIndex),
    [safeIndex]
  );

  const totalFiles = Object.values(safeIndex.files).filter((f) => !f.trashed).length;

  useEffect(() => {
    const raw = window.localStorage.getItem("gitstore:sidebar-collapsed");
    if (!raw) { setCollapseHydrated(true); return; }
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
    smart: collapsed.smart ?? false,
    folders: collapsed.folders ?? false,
  };

  const openFolderMenuAt = (folderPath: string, x: number, y: number) => {
    // Clamp to viewport so menu never escapes on small screens
    const MENU_W = 176; // min-w-44
    const clampedX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1280) - MENU_W - 8);
    setMenu({ path: folderPath, x: clampedX, y });
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
      const folderNode = fileTree.nodes.get(folder.path);
      const subfolderPaths = folderNode?.type === "folder"
        ? folderNode.children.filter((c) => fileTree.nodes.get(c)?.type === "folder")
        : [];
      const subfolders = subfolderPaths.map((p) => {
        const n = fileTree.nodes.get(p);
        return n ? { id: p, name: n.name, path: p, parent: folder.path, created: n.createdAt, starred: n.type === "folder" ? n.starred : undefined } : null;
      }).filter(Boolean) as typeof rootFolders;
      const hasChildren = subfolders.length > 0;
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
              openFolderMenuAt(folder.path, event.clientX, event.clientY);
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
              onClick={() => { router.push(`/dashboard?view=folder&path=${encodeURIComponent(folder.path)}`); close(); }}
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
          {!isCollapsed && renderFolderTree(subfolders, depth + 1)}
        </div>
      );
    });
  };

  // ── Shared sidebar inner content ─────────────────────────────────────────
  const innerContent = (
    <>
      <div className="mb-4 flex items-center justify-between px-2">
        <div>
          <p className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">GitStore</p>
          <p className="text-xs text-gray-500 mt-0.5">{totalFiles} files</p>
        </div>
        {/* Close button — only rendered/visible in drawer context (lg+ hides it) */}
        <button
          type="button"
          onClick={close}
          className="touch-target rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Close navigation"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4">
        <NewButton />
      </div>

      <nav className="space-y-1">
        <NavItem
          href="/dashboard"
          label="My Files"
          icon={HardDriveIcon}
          active={!view || (view === "folder" && !activePath)}
          onClick={close}
        />
        <NavItem
          href="/dashboard?view=trash"
          label="Trash"
          icon={Trash2Icon}
          active={view === "trash"}
          onClick={close}
        />
      </nav>

      <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

      <div className="flex-1 space-y-4 overflow-y-auto pr-1 overscroll-contain">
        {/* ── Smart Collections ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <SectionHeader
            title="Smart"
            collapsed={sectionCollapsed.smart}
            onToggle={() => toggleCollapsed("smart")}
          />
          {!sectionCollapsed.smart && (
            <div className="space-y-0.5">
              {loading
                ? [80, 68, 74].map((w, i) => (
                    <div key={i} className="h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ width: w }} />
                  ))
                : smartCollections.map((collection) => {
                    const Icon = SMART_ICONS[collection.icon] ?? FolderIcon;
                    const isActive = view === "smart" && smartType === collection.id;
                    return (
                      <button
                        key={collection.id}
                        type="button"
                        onClick={() => {
                          router.push(`/dashboard?view=smart&type=${collection.id}`);
                          close();
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                          isActive
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{collection.label}</span>
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {collection.count}
                        </span>
                      </button>
                    );
                  })}
              {!loading && smartCollections.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Upload files to see categories</p>
              )}
            </div>
          )}
        </section>

        {/* ── My Folders ────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <SectionHeader
            title="My Folders"
            collapsed={sectionCollapsed.folders}
            onToggle={() => toggleCollapsed("folders")}
            extra={
              <button
                type="button"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                onClick={() => window.dispatchEvent(new Event("gitstore:new-folder"))}
                aria-label="Create folder"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            }
          />
          {!sectionCollapsed.folders && (
            <div className="space-y-1">
              {rootFolders.length === 0 && !loading && (
                <p className="px-3 py-2 text-xs text-gray-400">No folders yet</p>
              )}
              {renderFolderTree(rootFolders, 0)}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 space-y-3 px-2">
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </Link>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{totalUsedGb.toFixed(2)} GB used</span>
            <span>250 GB</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar — always visible on lg+ ─────────────────────── */}
      <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 lg:flex">
        {innerContent}
      </aside>

      {/* ── Mobile/tablet drawer ─────────────────────────────────────────── */}
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[149] bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={close}
          aria-hidden
        />
      )}
      {/* Drawer panel */}
      <aside
        aria-label="Navigation drawer"
        aria-hidden={!isOpen}
        className={`fixed inset-y-0 left-0 z-[150] flex h-dvh w-72 max-w-[85vw] flex-col border-r border-gray-200 bg-white p-4 overscroll-none dark:border-gray-800 dark:bg-gray-900 lg:hidden transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0 animate-drawer-in" : "-translate-x-full pointer-events-none"
        }`}
      >
        {innerContent}
      </aside>

      {/* ── Folder context menu ────────────────────────────────────────────── */}
      {menu && (
        <div
          className="fixed z-[125] min-w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ left: menu.x, top: menu.y }}
        >
          {[
            {
              label: "Rename",
              icon: <PencilIcon className="h-4 w-4" />,
              onClick: () => {
                const path = menu.path;
                const name = path.split("/").filter(Boolean).at(-1) ?? path;
                setMenu(null);
                setRenameTarget({ path, name });
              },
            },
            {
              label: "Move to...",
              icon: <FolderInputIcon className="h-4 w-4" />,
              onClick: () => {
                const path = menu.path;
                const name = path.split("/").filter(Boolean).at(-1) ?? path;
                setMenu(null);
                setMoveTarget({ path, name });
              },
            },
            {
              label: (safeIndex.folders?.[menu.path]?.starred ?? false) ? "Unstar" : "Star",
              icon: <StarIcon className="h-4 w-4" />,
              onClick: async () => {
                const currentPath = menu.path;
                setMenu(null);
                const next = await toggleFolderStarAction(currentPath);
                await setIndex(next);
              },
            },
            {
              label: "Add files",
              icon: null,
              onClick: () => { triggerUpload({ targetFolder: menu.path }); setMenu(null); },
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={item.onClick}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              const path = menu.path;
              const name = path.split("/").filter(Boolean).at(-1) ?? path;
              setMenu(null);
              setDeleteTarget({ path, name });
            }}
          >
            Delete folder
          </button>
        </div>
      )}

      {/* ── Rename dialog ─────────────────────────────────────────────────── */}
      {renameTarget && (
        <RenameDialog
          open
          currentName={renameTarget.name}
          type="folder"
          onConfirm={async (newName) => {
            const result = await renameFolderAction(renameTarget.path, newName);
            await setIndex(result.index);
            if (activePath === renameTarget.path) {
              router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
            }
            setRenameTarget(null);
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {/* ── Move dialog ────────────────────────────────────────────────────── */}
      {moveTarget && index && (
        <MoveDialog
          open
          itemName={moveTarget.name}
          itemType="folder"
          currentLocation={
            moveTarget.path.includes("/")
              ? moveTarget.path.split("/").slice(0, -1).join("/")
              : "/"
          }
          disabledPaths={[
            moveTarget.path,
            ...Object.keys(index.folders ?? {}).filter((p) =>
              p.startsWith(moveTarget.path + "/")
            ),
          ]}
          index={index}
          onConfirm={async (dest) => {
            const result = await moveFolderAction(moveTarget.path, dest);
            await setIndex(result.index);
            if (activePath === moveTarget.path) {
              router.replace(`/dashboard?view=folder&path=${encodeURIComponent(result.newPath)}`);
            }
            setMoveTarget(null);
          }}
          onCancel={() => setMoveTarget(null)}
        />
      )}

      {/* ── Delete dialog ─────────────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete folder "${deleteTarget.name}"?`}
          description="The folder will be removed. Files inside will NOT be deleted — they will return to the default directory."
          confirmLabel="Delete folder"
          confirmVariant="danger"
          onConfirm={async () => {
            const next = await deleteFolderAction(deleteTarget.path);
            await setIndex(next);
            if (activePath === deleteTarget.path) {
              router.replace("/dashboard");
            }
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      {/*
       * Design principles:
       *  - 4 tabs max (Files, Recent, Upload, Starred)
       *  - Active state: filled pill behind icon + colored icon + colored label
       *  - pb-safe: adds env(safe-area-inset-bottom) for iPhone gesture bar
       *  - h-16 minimum height = 64px, ensuring icons + label clear 44px target
       *  - Settings moved to sidebar drawer (reduces clutter)
       *  - Upload is a visually distinct center action (not a standard nav tab)
       */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-safe dark:border-gray-800 dark:bg-gray-900 lg:hidden">
        <div className="grid h-16 grid-cols-4 items-center">
          {[
            {
              href: "/dashboard",
              icon: HardDriveIcon,
              label: "Files",
              active: !view || (view === "folder"),
              onClick: undefined as undefined | (() => void),
            },
            {
              href: "/dashboard?view=smart&type=recent",
              icon: ClockIcon,
              label: "Recent",
              active: view === "smart" && smartType === "recent",
              onClick: undefined,
            },
            {
              href: "#",
              icon: null, // special: upload FAB
              label: "Upload",
              active: false,
              onClick: () => window.dispatchEvent(new Event("gitstore:trigger-upload")),
            },
            {
              href: "/dashboard?view=smart&type=favorites",
              icon: StarIcon,
              label: "Starred",
              active: view === "smart" && smartType === "favorites",
              onClick: undefined,
            },
          ].map(({ href, icon: Icon, label, active, onClick }) => {
            // Upload button — visually distinct
            if (!Icon) {
              return (
                <button
                  key="upload"
                  type="button"
                  onClick={onClick}
                  className="touch-target flex flex-col items-center justify-center gap-0.5"
                  aria-label="Upload files"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-500/30 dark:bg-blue-500">
                    <UploadCloudIcon className="h-4.5 w-4.5 text-white" />
                  </span>
                  <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{label}</span>
                </button>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                className="touch-target flex flex-col items-center justify-center gap-0.5"
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                  active
                    ? "bg-blue-100 dark:bg-blue-950/60"
                    : "bg-transparent"
                }`}>
                  <Icon className={`h-5 w-5 transition-colors ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400"
                  }`} />
                </span>
                <span className={`text-[10px] font-medium transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
