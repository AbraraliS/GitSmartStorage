"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GitStoreIndex } from "@/types";
import { loadIndex, populateCacheLayers } from "@/lib/cache";

interface IndexContextValue {
  index: GitStoreIndex | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  setIndex: (next: GitStoreIndex) => Promise<void>;
}

const IndexContext = createContext<IndexContextValue | null>(null);

export function IndexProvider({ children }: { children: ReactNode }) {
  const [index, setIndexState] = useState<GitStoreIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setIndex = useCallback(async (next: GitStoreIndex) => {
    setIndexState(next);
    await populateCacheLayers(next);
  }, []);

  const refresh = useCallback(async (force = false) => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load index");
    } finally {
      setLoading(false);
    }
  }, [setIndex]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<IndexContextValue>(
    () => ({ index, loading, error, refresh, setIndex }),
    [index, loading, error, refresh, setIndex]
  );

  return <IndexContext.Provider value={value}>{children}</IndexContext.Provider>;
}

export function useIndex(): IndexContextValue {
  const ctx = useContext(IndexContext);
  if (!ctx) throw new Error("useIndex must be used within IndexProvider");
  return ctx;
}
