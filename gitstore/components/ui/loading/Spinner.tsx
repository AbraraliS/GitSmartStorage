"use client";

import { cn } from "../../../lib/utils";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label?: string; // for screen readers
}

const sizes = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/**
 * Spinner — generic circular loading indicator.
 * Respects prefers-reduced-motion.
 */
export function Spinner({ size = "md", className, label = "Loading…" }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "animate-spin text-current motion-reduce:hidden",
        sizes[size],
        className
      )}
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
      {/* Static fallback for reduced-motion */}
      <circle
        className="hidden motion-reduce:block opacity-30"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="15 45"
      />
    </svg>
  );
}
