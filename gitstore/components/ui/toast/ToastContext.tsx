"use client";

/**
 * components/ui/toast/ToastContext.tsx
 *
 * Lightweight toast system.
 *
 * Hydration safety:
 *   ToastContainer uses ClientPortal which defers portal mounting until
 *   after hydration. The server renders nothing for the toast region —
 *   zero SSR/client mismatch guaranteed.
 *
 * ID generation:
 *   Toast IDs use a monotonic counter (no Date.now / Math.random during
 *   render) to avoid non-deterministic output between server and client.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  Loader2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientPortal } from "@/components/ui/ClientPortal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info" | "progress";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms, 0 = persistent
  progress?: number; // 0–100 for "progress" variant
  undoLabel?: string;
  onUndo?: () => void;
}

interface ToastEntry extends ToastOptions {
  id: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  update: (id: string, options: Partial<ToastOptions>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
  progress: 0, // persistent
};

const MAX_TOASTS = 5;

// Monotonic counter — avoids Math.random/Date.now during render (non-deterministic)
let _toastSeq = 0;
function nextToastId() { return `gs-toast-${++_toastSeq}`; }

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleAutoDismiss = useCallback((id: string, duration: number) => {
    if (duration <= 0) return;
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, duration);
    timers.current.set(id, t);
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      // ID generated outside of render — no SSR mismatch risk
      const id = nextToastId();
      const variant = options.variant ?? "info";
      const duration = options.duration ?? DEFAULT_DURATION[variant];

      const entry: ToastEntry = { ...options, id, variant };

      setToasts((prev) => [entry, ...prev].slice(0, MAX_TOASTS));
      scheduleAutoDismiss(id, duration);
      return id;
    },
    [scheduleAutoDismiss]
  );

  const update = useCallback(
    (id: string, options: Partial<ToastOptions>) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...options } : t)));
      if (options.progress === 100) {
        const existing = timers.current.get(id);
        if (existing) clearTimeout(existing);
        scheduleAutoDismiss(id, 1500);
      }
    },
    [scheduleAutoDismiss]
  );

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    setToasts([]);
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);

  return (
    <ToastContext.Provider value={{ toast, update, dismiss, dismissAll }}>
      {children}
      {/*
        ClientPortal defers rendering until after hydration.
        The server emits nothing here — zero SSR/client mismatch.
      */}
      <ClientPortal>
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </ClientPortal>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ─── Toast Region ─────────────────────────────────────────────────────────────

const variantConfig = {
  success:  { icon: CheckCircleIcon,  iconClass: "text-emerald-400",        barClass: "bg-emerald-500", borderClass: "border-emerald-900/40" },
  error:    { icon: XCircleIcon,      iconClass: "text-red-400",            barClass: "bg-red-500",     borderClass: "border-red-900/40" },
  warning:  { icon: AlertTriangleIcon,iconClass: "text-amber-400",          barClass: "bg-amber-500",   borderClass: "border-amber-900/40" },
  info:     { icon: InfoIcon,         iconClass: "text-blue-400",           barClass: "bg-blue-500",    borderClass: "border-blue-900/40" },
  progress: { icon: Loader2Icon,      iconClass: "text-blue-400 animate-spin", barClass: "bg-blue-500", borderClass: "border-blue-900/40" },
};

function ToastRegion({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (id: string) => void }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 w-full max-w-sm pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}) {
  const cfg = variantConfig[t.variant];
  const Icon = cfg.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto overflow-hidden rounded-xl border bg-gray-900/95 shadow-2xl backdrop-blur",
        "flex items-start gap-3 px-4 py-3",
        cfg.borderClass
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", cfg.iconClass)} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 leading-snug">{t.title}</p>
        {t.description && (
          <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{t.description}</p>
        )}
        {t.variant === "progress" && t.progress !== undefined && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", cfg.barClass)}
              style={{ width: `${t.progress}%` }}
            />
          </div>
        )}
        {t.onUndo && (
          <button
            type="button"
            onClick={() => { t.onUndo?.(); onDismiss(t.id); }}
            className="mt-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            {t.undoLabel ?? "Undo"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        className="shrink-0 rounded p-0.5 text-gray-500 hover:text-gray-300 transition"
        aria-label="Dismiss notification"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
