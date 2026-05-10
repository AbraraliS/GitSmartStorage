"use client";

import { useEffect, useRef, useState } from "react";
import { FileIcon, FolderIcon, XIcon } from "lucide-react";
import { PendingButton } from "@/components/ui/loading/PendingButton";

export interface RenameDialogProps {
  open: boolean;
  currentName: string;
  type: "file" | "folder";
  /** Can be async — dialog locks itself while running and shows a spinner */
  onConfirm: (newName: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * RenameDialog — responsive bottom-sheet on mobile, centered on desktop.
 * Input is automatically selected and focused on open.
 * Virtual keyboard safe: dialog is pinned to bottom on mobile so keyboard
 * pushing the viewport doesn't hide the input or buttons.
 */
export function RenameDialog({
  open,
  currentName,
  type,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setPending(false); return; }
    setValue(currentName);
    setError("");
    const t = setTimeout(() => inputRef.current?.select(), 30);
    return () => clearTimeout(t);
  }, [open, currentName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, pending]);

  if (!open) return null;

  const validate = (val: string): string => {
    if (!val.trim()) return "Name cannot be empty.";
    if (val.includes("/") || val.includes("\\"))
      return 'Name cannot contain "/" or "\\".'
    return "";
  };

  const handleChange = (val: string) => {
    setValue(val);
    setError(validate(val));
  };

  const handleConfirm = async () => {
    const err = validate(value);
    if (err) { setError(err); return; }
    if (pending) return;
    setPending(true);
    try {
      await onConfirm(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
      setPending(false);
    }
  };

  const unchanged = value.trim() === currentName.trim();
  const isInvalid = !!validate(value);
  const disableConfirm = unchanged || isInvalid || pending;

  const Icon = type === "folder" ? FolderIcon : FileIcon;
  const iconColor = type === "folder" ? "text-amber-400" : "text-blue-400";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[299] bg-black/70"
        onClick={() => { if (!pending) onCancel(); }}
        aria-hidden
      />

      {/*
       * Dialog panel — bottom-sheet on mobile, centered on sm+
       * Pinned to bottom on mobile keeps it above the virtual keyboard
       */}
      <div
        role="dialog"
        aria-modal
        aria-labelledby="rename-title"
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
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-700 sm:hidden" aria-hidden />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="rename-title" className="text-base font-semibold text-gray-100">
            Rename {type}
          </h2>
          <button
            type="button"
            onClick={() => { if (!pending) onCancel(); }}
            disabled={pending}
            className="touch-target rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-30"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Input */}
        <div className="mt-4">
          <div
            className={`flex items-center gap-2 rounded-xl border bg-gray-800 px-3 py-3 transition-colors ${
              error
                ? "border-red-500/60 ring-1 ring-red-500/30"
                : "border-gray-600 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30"
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
            <input
              ref={inputRef}
              type="text"
              value={value}
              disabled={pending}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disableConfirm) void handleConfirm();
              }}
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 outline-none disabled:opacity-60"
              placeholder={`${type === "folder" ? "Folder" : "File"} name`}
              spellCheck={false}
              aria-label="New name"
              autoComplete="off"
            />
          </div>
          {error && (
            <p className="mt-1.5 text-xs text-red-400" role="alert">{error}</p>
          )}
        </div>

        {/* Footer — stacked on mobile, row on desktop */}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors disabled:opacity-30 sm:w-auto sm:py-2"
          >
            Cancel
          </button>
          <PendingButton
            pending={pending}
            pendingLabel="Renaming…"
            variant="primary"
            disabled={disableConfirm}
            onClick={() => void handleConfirm()}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-gray-950 disabled:bg-emerald-500/40 sm:w-auto"
          >
            Rename
          </PendingButton>
        </div>
      </div>
    </>
  );
}
