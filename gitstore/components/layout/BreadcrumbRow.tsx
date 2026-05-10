"use client";

/**
 * components/layout/BreadcrumbRow.tsx
 *
 * A dedicated breadcrumb navigation row rendered BELOW the Topbar,
 * ABOVE the main content area.
 *
 * Desktop: full breadcrumb, clickable hierarchy, right-aligned view toggles.
 * Mobile: horizontally-scrollable single line, no-scrollbar visible (overflow-x-auto
 *         with scrollbar hidden via CSS). Never wraps to multiple lines.
 *
 * Why separated from Topbar:
 *  - Prevents Topbar overflow on long paths
 *  - Cleaner hierarchy (actions ≠ location context)
 *  - Matches Google Drive / Dropbox navigation patterns
 *  - Allows independent sticky positioning if needed
 *
 * Memoized: breadcrumb segments are computed via useMemo to avoid re-renders.
 */

import { memo, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { ChevronRightIcon, Grid3X3Icon, ListIcon } from "lucide-react";
import { NODE_DEFINITIONS } from "@/lib/nodes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

function toTitle(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface Segment {
  label: string;
  href?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BreadcrumbRow = memo(function BreadcrumbRow() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const node     = params.get("node");
  const view     = params.get("view") ?? "";
  const path     = params.get("path") ?? "";
  const smartType  = params.get("type") ?? "";
  const smartValue = params.get("value") ?? "";
  const mode     = params.get("mode") ?? "grid";

  // ── Build segments ────────────────────────────────────────────────────────
  const segments: Segment[] = useMemo(() => {
    const s: Segment[] = [{ label: "My Files", href: "/dashboard" }];

    if (node) {
      const nodeLabel = NODE_DEFINITIONS[node as keyof typeof NODE_DEFINITIONS]?.label ?? toTitle(node);
      s.push({ label: "Default", href: "/dashboard?view=folder" });
      s.push({ label: nodeLabel });
    } else if (view === "folder" && path) {
      const parts = path.split("/").filter(Boolean);
      let currentPath = "";
      parts.forEach((part, idx) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = idx === parts.length - 1;
        s.push({
          label: part,
          href: isLast ? undefined : `/dashboard?view=folder&path=${encodeURIComponent(currentPath)}`,
        });
      });
    } else if (view === "smart") {
      s.push({ label: "Smart", href: "/dashboard?view=folder" });
      if (smartType === "month") {
        s.push({ label: formatMonth(smartValue) });
      } else if (smartType === "tag") {
        s.push({ label: `#${smartValue}` });
      } else if (smartType === "node") {
        const nodeLabel = NODE_DEFINITIONS[smartValue as keyof typeof NODE_DEFINITIONS]?.label ?? toTitle(smartValue);
        s.push({ label: nodeLabel });
      } else if (smartType === "starred" || smartType === "favorites") {
        s.push({ label: "Starred" });
      } else if (smartType === "recent") {
        s.push({ label: "Recent" });
      }
    } else if (view === "trash") {
      s.push({ label: "Trash" });
    }

    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, view, path, smartType, smartValue]);

  // ── View mode toggle ──────────────────────────────────────────────────────
  const setMode = (nextMode: "grid" | "list") => {
    const next = new URLSearchParams(params.toString());
    next.set("mode", nextMode);
    router.replace(`${pathname}?${next.toString()}`);
  };

  // ── Compressed mobile: Root / … / Current ────────────────────────────────
  // On small screens we show: first + ellipsis + last (if > 2 segments)
  const mobileSegments: Segment[] =
    segments.length > 2
      ? [segments[0]!, { label: "…" }, segments[segments.length - 1]!]
      : segments;


  return (
    <div className="flex shrink-0 items-center justify-between bg-white px-3 dark:bg-gray-900 md:border-b md:border-gray-100 md:dark:border-gray-800/60 md:px-4">

      {/* ── Breadcrumb — scrollable on mobile ───────────────────────────── */}
      {/*
       * overflow-x-auto + whitespace-nowrap gives horizontal scroll.
       * scrollbar is hidden via [&::-webkit-scrollbar]:hidden in inline style.
       * "min-w-0 flex-1" ensures it doesn't overflow its flex parent.
       */}
      <nav
        aria-label="Breadcrumb"
        className="hide-scrollbar min-w-0 flex-1 overflow-x-auto py-2"
      >
        {/* Full breadcrumb — hidden on mobile */}
        <ol className="hidden items-center gap-1 text-sm md:flex">
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <li key={`${seg.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                {seg.href && !isLast ? (
                  <Link
                    href={seg.href}
                    className="truncate text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {seg.label}
                  </Link>
                ) : (
                  <span className={`truncate ${isLast ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                    {seg.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Compressed breadcrumb — shown only on mobile */}
        <ol className="flex items-center gap-1 whitespace-nowrap text-sm md:hidden">
          {mobileSegments.map((seg, i) => {
            const isLast = i === mobileSegments.length - 1;
            const isEllipsis = seg.label === "…";
            return (
              <li key={`m-${seg.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                {isEllipsis ? (
                  <span className="text-gray-400">…</span>
                ) : seg.href && !isLast ? (
                  <Link
                    href={seg.href}
                    className="text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400"
                  >
                    {seg.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}>
                    {seg.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Right: view toggles + new folder (desktop only) ─────────────── */}
      <div className="ml-2 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => setMode("grid")}
          className={`touch-target flex rounded-lg ${mode === "grid" ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="Grid view"
          aria-pressed={mode === "grid"}
        >
          <Grid3X3Icon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`touch-target flex rounded-lg ${mode === "list" ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="List view"
          aria-pressed={mode === "list"}
        >
          <ListIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
