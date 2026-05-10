"use client";

/**
 * components/providers/SidebarContext.tsx
 * Manages the mobile/tablet drawer open state.
 *
 * Desktop (>= 1024px): sidebar is always visible — this context is irrelevant.
 * Tablet (640–1023px): drawer, opened by hamburger in Topbar.
 * Mobile (< 640px): drawer, same behavior.
 *
 * useSidebar() is available anywhere inside DashboardLayout.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface SidebarContextValue {
  isOpen: boolean;
  open:   () => void;
  close:  () => void;
  toggle: () => void;
  // Desktop sidebar collapse
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isOpen: false,
  open:   () => {},
  close:  () => {},
  toggle: () => {},
  isCollapsed: false,
  toggleCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const open   = useCallback(() => setIsOpen(true),  []);
  const close  = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  
  const toggleCollapsed = useCallback(() => setIsCollapsed((v) => !v), []);

  // Close drawer when viewport grows to desktop size
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setIsOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Escape key closes drawer
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, open, close, toggle, isCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
