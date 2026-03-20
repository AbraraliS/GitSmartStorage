"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SelectionContextValue {
  selected: Set<string>;           // set of file hashes
  isSelected: (hash: string) => boolean;
  toggle: (hash: string) => void;
  selectAll: (hashes: string[]) => void;
  clearSelection: () => void;
  count: number;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((hash: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (hash: string) => selected.has(hash),
    [selected]
  );

  const selectAll = useCallback((hashes: string[]) => {
    setSelected(new Set(hashes));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({ selected, isSelected, toggle, selectAll, clearSelection, count: selected.size }),
    [selected, isSelected, toggle, selectAll, clearSelection]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
