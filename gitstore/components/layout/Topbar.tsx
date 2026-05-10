"use client";

/**
 * components/layout/Topbar.tsx
 *
 * Simplified top navigation bar.
 *
 * Contains ONLY:
 *   Left:   Hamburger (mobile/tablet) | GitStore wordmark (desktop)
 *   Center: SearchBar (always)
 *   Right:  Avatar menu
 *
 * View toggles, new-folder button, and breadcrumbs have been
 * moved to BreadcrumbRow (below this bar).
 *
 * Mobile search:
 *   - SearchBar is hidden on small screens
 *   - A search icon appears in the right cluster
 *   - Tapping it expands SearchBar to full-width takeover
 */

import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { SearchBar } from "@/components/files/SearchBar";
import { clearAllCaches } from "@/lib/cache";
import { useSidebar } from "@/components/providers/SidebarContext";

export function Topbar() {
  const { data: session } = useSession();
  const { toggle: toggleSidebar } = useSidebar();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 md:gap-3 md:px-4">

      {/* ── Left ────────────────────────────────────────────────────────── */}
      <div className={`flex shrink-0 items-center gap-2 ${searchExpanded ? "hidden sm:flex" : "flex"}`}>
        {/* Hamburger — only on mobile/tablet (hidden on desktop) */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="touch-target shrink-0 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        {/* Wordmark — only on desktop (replaces the hamburger role) */}
        <span className="hidden select-none text-base font-bold tracking-tight text-gray-900 dark:text-gray-100 lg:block">
          GitStore
        </span>
      </div>

      {/* ── Center: Search ───────────────────────────────────────────────── */}
      <div className={`${searchExpanded ? "flex flex-1" : "hidden sm:flex sm:flex-1"} items-center gap-2`}>
        {searchExpanded && (
          <button
            type="button"
            onClick={() => setSearchExpanded(false)}
            className="touch-target shrink-0 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 sm:hidden"
            aria-label="Close search"
          >
            <XIcon className="h-5 w-5" />
          </button>
        )}
        <SearchBar />
      </div>

      {/* ── Right ────────────────────────────────────────────────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">

        {/* Search icon — mobile only, tap expands search bar */}
        {!searchExpanded && (
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            className="touch-target rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 sm:hidden"
            aria-label="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        )}

        {/* Avatar + sign-out dropdown */}
        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            aria-haspopup="menu"
            aria-expanded={avatarOpen}
            aria-label="Account menu"
          >
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="Avatar" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {session?.user?.name?.slice(0, 1) ?? "U"}
              </span>
            )}
          </button>

          {avatarOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} aria-hidden />
              <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {session?.user?.name ?? "User"}
                  </p>
                  <p className="truncate text-xs text-gray-500">{session?.user?.email ?? ""}</p>
                </div>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={async () => {
                    setAvatarOpen(false);
                    await clearAllCaches();
                    await signOut({ callbackUrl: "/" });
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
