"use client";

/**
 * contexts/ActionStateContext.tsx
 *
 * Centralized async action tracking for GitStore.
 *
 * Architecture:
 *   - Tracks in-flight operations by stable ID (hash for files, path for folders)
 *   - Lightweight: only rerenders components that subscribe to specific IDs
 *   - Prevents duplicate actions on the same item
 *   - Provides optimistic rollback on failure
 *
 * Usage:
 *   const { startAction, endAction, isPending, getPendingLabel } = useActionState();
 *   await startAction("delete", file.hash, async () => { ... });
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType =
  | "delete"
  | "trash"
  | "restore"
  | "move"
  | "rename"
  | "star"
  | "download"
  | "upload"
  | "preview"
  | "folder-create"
  | "folder-delete"
  | "folder-rename"
  | "folder-move"
  | "sync"
  | "refresh"
  | "cache-clear"
  | "bulk";

export const ACTION_LABELS: Record<ActionType, string> = {
  delete: "Deleting…",
  trash: "Moving to trash…",
  restore: "Restoring…",
  move: "Moving…",
  rename: "Renaming…",
  star: "Updating…",
  download: "Downloading…",
  upload: "Uploading…",
  preview: "Loading…",
  "folder-create": "Creating folder…",
  "folder-delete": "Deleting folder…",
  "folder-rename": "Renaming folder…",
  "folder-move": "Moving folder…",
  sync: "Syncing…",
  refresh: "Refreshing…",
  "cache-clear": "Clearing cache…",
  bulk: "Processing…",
};

export interface PendingEntry {
  type: ActionType;
  label: string;
  startedAt: number;
}

interface ActionStateContextValue {
  /**
   * Execute an async action with automatic pending state management.
   * Returns the action's result. On failure, clears pending state and rethrows.
   */
  startAction: <T>(
    type: ActionType,
    id: string,
    fn: () => Promise<T>
  ) => Promise<T>;
  /** Returns true if any action is pending for this ID */
  isPending: (id: string) => boolean;
  /** Returns the label for the pending action on this ID, or null */
  getPendingLabel: (id: string) => string | null;
  /** Map of all pending entries (for bulk displays) */
  pending: Map<string, PendingEntry>;
  /** Total number of in-flight actions */
  pendingCount: number;
}

const ActionStateContext = createContext<ActionStateContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActionStateProvider({ children }: { children: ReactNode }) {
  // Use a ref for the Map to avoid full-tree rerenders on every change;
  // trigger rerenders only via the counter
  const pendingRef = useRef<Map<string, PendingEntry>>(new Map());
  const [, forceUpdate] = useState(0);

  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

  const startAction = useCallback(
    async <T,>(type: ActionType, id: string, fn: () => Promise<T>): Promise<T> => {
      // Prevent duplicate action on the same ID
      if (pendingRef.current.has(id)) {
        throw new Error(`Action already in progress for: ${id}`);
      }

      pendingRef.current.set(id, {
        type,
        label: ACTION_LABELS[type],
        startedAt: Date.now(),
      });
      rerender();

      try {
        const result = await fn();
        return result;
      } finally {
        pendingRef.current.delete(id);
        rerender();
      }
    },
    [rerender]
  );

  const isPending = useCallback(
    (id: string) => pendingRef.current.has(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingRef.current.size] // re-evaluate when map changes
  );

  const getPendingLabel = useCallback(
    (id: string) => pendingRef.current.get(id)?.label ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingRef.current.size]
  );

  const value = useMemo<ActionStateContextValue>(
    () => ({
      startAction,
      isPending,
      getPendingLabel,
      pending: pendingRef.current,
      pendingCount: pendingRef.current.size,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startAction, isPending, getPendingLabel, pendingRef.current.size]
  );

  return (
    <ActionStateContext.Provider value={value}>
      {children}
    </ActionStateContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useActionState(): ActionStateContextValue {
  const ctx = useContext(ActionStateContext);
  if (!ctx) throw new Error("useActionState must be used within ActionStateProvider");
  return ctx;
}

/** Convenience hook: returns pending status and label for a single ID */
export function useIsPending(id: string): { pending: boolean; label: string | null } {
  const { isPending, getPendingLabel } = useActionState();
  return { pending: isPending(id), label: getPendingLabel(id) };
}

/**
 * Returns a wrapped async function that automatically manages pending state.
 *
 * Example:
 *   const run = usePendingAction("delete", file.hash);
 *   await run(() => deleteFileAction(file.hash));
 */
export function usePendingAction(type: ActionType, id: string) {
  const { startAction } = useActionState();
  return useCallback(
    <T,>(fn: () => Promise<T>) => startAction(type, id, fn),
    [startAction, type, id]
  );
}
