"use client";

import {
  useRef,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { GitStoreIndex, FileRecord } from "@/types";
import { purgeExpiredTrashAction } from "@/app/dashboard/actions";
import {
  clearAllCaches,
  loadIndex,
  populateCacheLayers,
  setCurrentUser,
} from "@/lib/cache";
import { addFileToIndex } from "@/lib/index";

interface IndexContextValue {
  index: GitStoreIndex | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  setIndex: (next: GitStoreIndex) => Promise<void>;
  /**
   * Optimistically insert a file record into the local index immediately,
   * without waiting for a remote GitHub round-trip.
   * Call this right after upload completes on the client side.
   */
  optimisticAddFile: (record: FileRecord) => Promise<void>;
}

const IndexContext = createContext<IndexContextValue | null>(null);

export function IndexProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [index, setIndexState] = useState<GitStoreIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevLoginRef = useRef<string | null>(null);

  const setIndex = useCallback(async (next: GitStoreIndex) => {
    setIndexState(next);
    await populateCacheLayers(next);
  }, []);

  /**
   * Immediately inserts a file record into the local in-memory index and
   * persists to IndexedDB (L2 cache). GitHub remote (L5) is synced separately.
   * This makes newly uploaded files visible instantly in the UI.
   */
  const optimisticAddFile = useCallback(
    async (record: FileRecord) => {
      setIndexState((prev) => {
        if (!prev) return prev;
        const next: GitStoreIndex = {
          ...prev,
          files: { ...prev.files },
          search_index: { ...prev.search_index },
          folders: { ...(prev.folders ?? {}) },
        };
        addFileToIndex(next, record);
        // Fire-and-forget cache write (no await in setState)
        void populateCacheLayers(next);
        return next;
      });
    },
    []
  );

  const refresh = useCallback(
    async (force = false) => {
      setError(null);
      setLoading(true);

      try {
        if (!force) {
          const cached = await loadIndex();
          if (cached) {
            setIndexState(cached);
            setLoading(false);
            return;
          }
        }

        let res = await fetch("/api/sync");
        if (!res.ok) {
          const boot = await fetch("/api/bootstrap", { method: "POST" });
          if (!boot.ok) throw new Error("Failed to bootstrap index");
          const bootData = (await boot.json()) as { index?: GitStoreIndex };
          if (bootData.index) {
            await setIndex(bootData.index);
            return;
          }
          throw new Error("Bootstrap returned empty index");
        }

        const data = (await res.json()) as { index: GitStoreIndex | null };
        if (!data.index) {
          res = await fetch("/api/bootstrap", { method: "POST" });
          if (!res.ok) throw new Error("Failed to initialize index");
          const init = (await res.json()) as { index?: GitStoreIndex };
          if (!init.index) throw new Error("Index unavailable");
          await setIndex(init.index);
          return;
        }

        await setIndex(data.index);

        // Trigger auto-purge asynchronously (fire-and-forget)
        void purgeExpiredTrashAction()
          .then((next) => {
            if (next) setIndexState(next);
          })
          .catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load index");
      } finally {
        setLoading(false);
      }
    },
    [setIndex]
  );

  useEffect(() => {
    if (status === "loading") return;

    const login =
      (session as unknown as { login?: string } | null)?.login ?? null;
    const prevLogin = prevLoginRef.current;

    if (prevLogin === login) {
      return;
    }

    void (async () => {
      setCurrentUser(login ?? "anonymous");

      if (prevLogin && prevLogin !== login) {
        console.warn(
          `[cache] namespace switched from ${prevLogin} to ${login}; clearing caches`
        );
      }

      await clearAllCaches();
      setIndexState(null);
      prevLoginRef.current = login;

      if (login) {
        await refresh(true);
      } else {
        setLoading(false);
      }
    })();
  }, [refresh, session, status]);

  // Listen for external refresh requests (e.g. PreviewModal delete action)
  useEffect(() => {
    const onRefresh = () => void refresh(true);
    window.addEventListener("gitstore:refresh-index", onRefresh);
    return () =>
      window.removeEventListener("gitstore:refresh-index", onRefresh);
  }, [refresh]);

  const value = useMemo<IndexContextValue>(
    () => ({ index, loading, error, refresh, setIndex, optimisticAddFile }),
    [index, loading, error, refresh, setIndex, optimisticAddFile]
  );

  return (
    <IndexContext.Provider value={value}>{children}</IndexContext.Provider>
  );
}

export function useIndex(): IndexContextValue {
  const ctx = useContext(IndexContext);
  if (!ctx) throw new Error("useIndex must be used within IndexProvider");
  return ctx;
}
