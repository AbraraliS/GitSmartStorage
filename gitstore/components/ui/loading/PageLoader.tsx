"use client";

import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

/** Full-page loading state (e.g. initial index hydration) */
export function PageLoader({ label = "Loading GitStore…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" className="text-blue-400" />
        <p className="text-sm text-gray-400 animate-pulse">{label}</p>
      </div>
    </div>
  );
}
