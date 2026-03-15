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
import type { GitStoreIndex } from "@/types";
import {
  clearAllCaches,
  loadIndex,
  populateCacheLayers,
  setCurrentUser,
} from "@/lib/cache";

interface IndexContextValue {
  index: GitStoreIndex | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  setIndex: (next: GitStoreIndex) => Promise<void>;
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
    if (status === "loading") return;

    const login = (session as unknown as { login?: string } | null)?.login ?? null;
    const prevLogin = prevLoginRef.current;

    if (prevLogin === login) {
      return;
    }

    void (async () => {
      setCurrentUser(login ?? "anonymous");

      if (prevLogin && prevLogin !== login) {
        console.warn(`[cache] namespace switched from ${prevLogin} to ${login}; clearing caches`);
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
