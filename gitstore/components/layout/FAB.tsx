"use client";

/**
 * components/layout/FAB.tsx
 *
 * Floating Action Button — mobile/tablet only (lg:hidden).
 *
 * Behavior:
 *  - Floating above bottom nav, bottom-right
 *  - Tapping opens a bottom action sheet (FabSheet)
 *  - FAB shifts upward when the UploadTray is expanded (not minimized)
 *  - Hides when upload tray is open full-screen to avoid overlap
 *  - Respects env(safe-area-inset-bottom)
 *
 * Positioning math:
 *   bottom-nav height:   4rem  (h-16 = 64px)
 *   gap above nav:       1rem  (16px)
 *   safe-area:           env(safe-area-inset-bottom, 0px)
 *   tray expanded shift: +4rem  (upload tray header ≈ 64px)
 *
 * total default: calc(4rem + 1rem + safe-area) = calc(5rem + safe-area)
 * tray expanded: calc(5rem + safe-area + 4rem) = calc(9rem + safe-area)
 */

import { useEffect, useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { useUpload } from "@/components/providers/UploadContext";
import { FabSheet } from "@/components/layout/FabSheet";

export function FAB() {
  const { uploads, minimized } = useUpload();
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Tray is visible and NOT minimized = full tray showing
  const trayExpanded = uploads.length > 0 && !minimized;

  // Close sheet on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const bottomOffset = trayExpanded
    ? "calc(9rem + env(safe-area-inset-bottom, 0px))"
    : "calc(5rem + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      {/* FAB button */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ bottom: bottomOffset }}
        className={[
          // Position
          "fixed right-4 z-[45] lg:hidden",
          // Size — 56px circle
          "flex h-14 w-14 items-center justify-center rounded-full",
          // Style
          "bg-blue-600 text-white shadow-lg shadow-blue-500/25 dark:bg-blue-500",
          // Hover / focus
          "hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-blue-400",
          // Transitions — transform + opacity only (no layout thrash)
          "transition-all duration-200",
          open ? "rotate-45" : "rotate-0",
        ].join(" ")}
        aria-label={open ? "Close actions" : "Open actions"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {/* Rotate between + and × using CSS transform */}
        <PlusIcon className="h-6 w-6 transition-transform duration-200" />
      </button>

      {/* Bottom action sheet */}
      <FabSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
