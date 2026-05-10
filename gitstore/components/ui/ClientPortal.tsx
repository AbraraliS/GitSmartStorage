"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * useMounted — returns true only after the component has hydrated on the client.
 *
 * Why: React SSR renders components on the server. Portal/document access
 * must be deferred until after hydration to avoid:
 *   - "Hydration mismatch" errors (server HTML ≠ client HTML)
 *   - "document is not defined" crashes during SSR
 *
 * Usage:
 *   const mounted = useMounted();
 *   if (!mounted) return null; // suppress during SSR
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/**
 * ClientPortal — SSR-safe createPortal wrapper.
 *
 * All portals in GitStore must use this instead of calling createPortal directly.
 * Guarantees:
 *   - Zero SSR output (returns null on server)
 *   - Zero hydration mismatch (client renders identically to server on first pass)
 *   - document.body access only after mount
 *
 * Usage:
 *   <ClientPortal>
 *     <MyFloatingMenu />
 *   </ClientPortal>
 *
 * or with a custom container:
 *   <ClientPortal container={someRef.current}>
 *     <MyOverlay />
 *   </ClientPortal>
 */
export function ClientPortal({
  children,
  container,
}: {
  children: ReactNode;
  container?: Element | null;
}) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(children, container ?? document.body);
}
