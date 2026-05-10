"use client";

import { cn } from "../../../lib/utils";

interface ProgressBarProps {
  value: number; // 0–100
  label?: string;
  size?: "xs" | "sm" | "md";
  variant?: "blue" | "green" | "amber" | "red";
  showValue?: boolean;
  animated?: boolean;
  className?: string;
}

const variantColors = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

/**
 * ProgressBar — accessible progress indicator for uploads, PDF renders,
 * bulk operations, and sync flows.
 */
export function ProgressBar({
  value,
  label = "Progress",
  size = "sm",
  variant = "blue",
  showValue = false,
  animated = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          {showValue && <span>{Math.round(clamped)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn(
          "w-full overflow-hidden rounded-full bg-gray-800",
          size === "xs" && "h-1",
          size === "sm" && "h-1.5",
          size === "md" && "h-2.5"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            variantColors[variant],
            animated && clamped < 100 && "animate-pulse"
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
