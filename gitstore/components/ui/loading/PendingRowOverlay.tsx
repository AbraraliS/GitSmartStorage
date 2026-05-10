"use client";

import { cn } from "@/lib/utils";
import { InlineSpinner } from "./InlineSpinner";

interface PendingRowOverlayProps {
  pending: boolean;
  label?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * PendingRowOverlay
 *
 * Wraps a table row's cell contents to visually indicate an in-flight action.
 * Does NOT wrap the <tr> itself (which breaks table layout) — instead wraps
 * the cell's inner content or a cell with position:relative.
 *
 * Usage in a <td>:
 *   <td className="relative">
 *     <PendingRowOverlay pending={isPending} label="Deleting…">
 *       {normalContent}
 *     </PendingRowOverlay>
 *   </td>
 */
export function PendingRowOverlay({ pending, label = "Processing…", children, className }: PendingRowOverlayProps) {
  return (
    <span className={cn("relative inline-flex w-full", className)} aria-busy={pending}>
      <span className={cn("transition-opacity duration-150", pending && "opacity-30 pointer-events-none select-none")}>
        {children}
      </span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-start">
          <InlineSpinner label={label} className="text-blue-400" />
        </span>
      )}
    </span>
  );
}
