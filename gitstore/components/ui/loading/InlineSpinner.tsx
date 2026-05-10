"use client";

import { cn } from "../../../lib/utils";

interface InlineSpinnerProps {
  label?: string;
  className?: string;
}

/**
 * InlineSpinner — minimal inline spinner for use inside buttons, table cells,
 * and other tight spaces. No padding, no layout shifts.
 */
export function InlineSpinner({ label = "Loading…", className }: InlineSpinnerProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-busy="true">
      <svg
        role="status"
        aria-label={label}
        viewBox="0 0 16 16"
        fill="none"
        className="h-3.5 w-3.5 animate-spin shrink-0 motion-reduce:opacity-50"
      >
        <circle className="opacity-20" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" />
        <path className="opacity-80" fill="currentColor" d="M2 8a6 6 0 016-6V0C3.58 0 0 3.58 0 8h2z" />
      </svg>
      <span className="text-xs">{label}</span>
    </span>
  );
}
