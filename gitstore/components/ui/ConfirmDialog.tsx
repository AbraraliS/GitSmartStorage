"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import { PendingButton } from "@/components/ui/loading/PendingButton";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "default";
  /** Called when user confirms. Can be async — dialog shows spinner while running. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * ConfirmDialog with built-in pending state.
 *
 * Mobile: slides up from bottom as a bottom-sheet (rounded-t-2xl, no rounding on bottom).
 * Desktop (sm+): centered floating modal with scale-in animation.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) { setPending(false); return; }
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, pending]);

  if (!open) return null;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[299] bg-black/70"
        onClick={() => { if (!pending) onCancel(); }}
        aria-hidden
      />

      {/*
       * Dialog panel:
       *   Mobile  → full-width, pinned to bottom, rounded-t-2xl, slides up
       *   Desktop → centered, max-w-md, rounded-2xl, scale-in
       */}
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        aria-busy={pending}
        className={[
          "fixed z-[300] w-full border border-gray-700 bg-gray-900 shadow-2xl",
          // Mobile: bottom-sheet
          "bottom-0 left-0 right-0 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
          "animate-slide-up",
          // Desktop: centered modal
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:rounded-2xl sm:p-6 sm:animate-fade-scale",
        ].join(" ")}
      >
        {/* Drag handle — visible only on mobile */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-700 sm:hidden" aria-hidden />

        <div className="flex items-start gap-4">
          {confirmVariant === "danger" && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangleIcon className="h-5 w-5 text-red-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-gray-100">{title}</h2>
            <p id="confirm-desc" className="mt-1.5 text-sm text-gray-400 leading-relaxed">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => { if (!pending) onCancel(); }}
            disabled={pending}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-30"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors disabled:opacity-30 sm:w-auto sm:py-2"
          >
            Cancel
          </button>
          <PendingButton
            pending={pending}
            pendingLabel={`${confirmLabel}…`}
            variant={confirmVariant === "danger" ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </PendingButton>
        </div>
      </div>
    </>
  );
}
