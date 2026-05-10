"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

interface PendingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  pendingLabel?: string;
  variant?: "primary" | "danger" | "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  children: ReactNode;
}

const variantStyles = {
  primary: "bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-600/50",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/50",
  ghost: "text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40",
  secondary: "border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2.5",
};

/**
 * PendingButton
 *
 * A button that shows an inline spinner and disables itself during async operations.
 * Width is preserved so the layout doesn't shift.
 *
 * Features:
 *   - Inline spinner replaces icon during pending state
 *   - Label changes to pendingLabel while pending
 *   - Auto-disabled when pending or disabled prop is set
 *   - Smooth opacity transition, no layout jump
 *   - aria-busy + aria-disabled for accessibility
 */
export const PendingButton = forwardRef<HTMLButtonElement, PendingButtonProps>(
  function PendingButton(
    {
      pending = false,
      pendingLabel,
      variant = "primary",
      size = "md",
      icon,
      children,
      className,
      disabled,
      ...rest
    },
    ref
  ) {
    const isDisabled = disabled || pending;
    const displayLabel = pending && pendingLabel ? pendingLabel : children;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={pending}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...rest}
      >
        {pending ? (
          <Spinner size="xs" className="shrink-0" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        <span>{displayLabel}</span>
      </button>
    );
  }
);
