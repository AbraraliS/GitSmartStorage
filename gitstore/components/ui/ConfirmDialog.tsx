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
 * The confirm button shows a spinner while onConfirm() is running
 * and is disabled to prevent double-clicks.
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
      <div className="fixed inset-0 z-[299] bg-black/70" onClick={() => { if (!pending) onCancel(); }} aria-hidden />
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        aria-busy={pending}
        className="fixed left-1/2 top-1/2 z-[300] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
      >
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

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors disabled:opacity-30"
          >
            Cancel
          </button>
          <PendingButton
            pending={pending}
            pendingLabel={`${confirmLabel}…`}
            variant={confirmVariant === "danger" ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </PendingButton>
        </div>
      </div>
    </>
  );
}
