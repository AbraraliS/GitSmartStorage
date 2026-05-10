"use client";

/**
 * components/layout/FabSheet.tsx
 *
 * Bottom action sheet triggered by the FAB.
 *
 * Actions:
 *  - Upload File  → dispatches "gitstore:trigger-upload"
 *  - Create Folder → dispatches "gitstore:new-folder"
 *
 * UX:
 *  - Slides up from bottom on open
 *  - Tap outside (backdrop) or swipe-down dismisses
 *  - Respects env(safe-area-inset-bottom)
 *  - Large touch targets (min 56px row height)
 *  - Accessible: role=dialog, aria-modal, focus management
 *  - Reduced motion: animation skipped
 */

import { useEffect, useRef } from "react";
import { FolderPlusIcon, UploadCloudIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";

interface FabSheetProps {
  open: boolean;
  onClose: () => void;
}

interface SheetAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  onClick: () => void;
}

export function FabSheet({ open, onClose }: FabSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { triggerUpload } = useUpload();

  // Focus the sheet when it opens for accessibility
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => sheetRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Swipe-down to dismiss
  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0]!.clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const deltaY = e.changedTouches[0]!.clientY - startY;
      if (deltaY > 60) onClose(); // swipe down > 60px
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, onClose]);

  const actions: SheetAction[] = [
    {
      id: "upload",
      label: "Upload File",
      description: "Add files from your device",
      icon: UploadCloudIcon,
      iconBg: "bg-blue-50 dark:bg-blue-950/50",
      onClick: () => {
        onClose();
        // Use existing upload flow directly
        triggerUpload();
      },
    },
    {
      id: "folder",
      label: "Create Folder",
      description: "Organise files into folders",
      icon: FolderPlusIcon,
      iconBg: "bg-amber-50 dark:bg-amber-950/50",
      onClick: () => {
        onClose();
        setTimeout(() => window.dispatchEvent(new Event("gitstore:new-folder")), 120);
      },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-[44] bg-black/50 lg:hidden transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet panel */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal
        aria-label="Quick actions"
        tabIndex={-1}
        className={[
          // Position & size
          "fixed bottom-0 left-0 right-0 z-[46] lg:hidden",
          // Shape
          "rounded-t-2xl border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
          // Padding — bottom adds safe-area
          "px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]",
          // Shadow
          "shadow-2xl",
          // Slide-up animation — transform only
          "transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-y-0" : "translate-y-full",
          // Outline reset for focus
          "outline-none",
        ].join(" ")}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />

        {/* Section label */}
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Add to GitStore
        </p>

        {/* Action rows */}
        <div className="space-y-1">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700"
              >
                {/* Icon */}
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.iconBg}`}>
                  <Icon className={`h-5 w-5 ${
                    action.id === "upload" ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"
                  }`} />
                </span>
                {/* Text */}
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {action.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {action.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
