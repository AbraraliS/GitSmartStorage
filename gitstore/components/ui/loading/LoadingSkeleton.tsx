"use client";

import { cn } from "../../../lib/utils";

interface LoadingSkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
  animate?: boolean;
}

/** Base skeleton shimmer block */
export function LoadingSkeleton({ className, rounded = "md", animate = true }: LoadingSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-gray-800/70",
        animate && "animate-pulse",
        rounded === "sm" && "rounded",
        rounded === "md" && "rounded-md",
        rounded === "lg" && "rounded-lg",
        rounded === "full" && "rounded-full",
        className
      )}
    />
  );
}

/** Skeleton for a single file/folder list row */
export function FileSkeleton() {
  return (
    <div className="flex items-center gap-3 border-t border-gray-800 px-3 py-3" aria-hidden>
      <LoadingSkeleton className="h-4 w-4 shrink-0" rounded="sm" />
      <LoadingSkeleton className="h-5 w-5 shrink-0" rounded="md" />
      <LoadingSkeleton className="h-4 flex-1 max-w-[40%]" rounded="md" />
      <LoadingSkeleton className="hidden h-3.5 w-16 md:block" rounded="md" />
      <LoadingSkeleton className="hidden h-3.5 w-24 lg:block" rounded="md" />
      <LoadingSkeleton className="h-3.5 w-12" rounded="md" />
    </div>
  );
}

/** Skeleton for the list view table */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading files…"
      className="overflow-hidden rounded-xl border border-gray-800"
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-gray-900 px-3 py-2.5 border-b border-gray-800" aria-hidden>
        <LoadingSkeleton className="h-4 w-4 shrink-0" rounded="sm" />
        <LoadingSkeleton className="h-3.5 w-12" rounded="md" />
        <LoadingSkeleton className="hidden h-3.5 w-10 md:block ml-auto" rounded="md" />
        <LoadingSkeleton className="hidden h-3.5 w-16 lg:block" rounded="md" />
        <LoadingSkeleton className="h-3.5 w-10" rounded="md" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <FileSkeleton key={i} />
      ))}
      <span className="sr-only">Loading files…</span>
    </div>
  );
}

/** Skeleton for the grid view */
export function GridSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading files…"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} aria-hidden className="rounded-xl border border-gray-800 p-2 space-y-2">
          <LoadingSkeleton className="h-24 w-full" rounded="lg" />
          <LoadingSkeleton className="h-3.5 w-3/4" rounded="md" />
          <LoadingSkeleton className="h-3 w-1/2" rounded="md" />
        </div>
      ))}
      <span className="sr-only">Loading files…</span>
    </div>
  );
}

/** Skeleton for sidebar folder tree items */
export function SidebarSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div role="status" aria-label="Loading navigation…" className="space-y-1 px-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5" aria-hidden>
          <LoadingSkeleton className="h-4 w-4 shrink-0" rounded="sm" />
          <LoadingSkeleton className={`h-3.5 flex-1 ${["w-1/2", "w-2/3", "w-3/4", "w-1/2", "w-3/5"][i % 5]}`} rounded="md" />
        </div>
      ))}
      <span className="sr-only">Loading navigation…</span>
    </div>
  );
}
