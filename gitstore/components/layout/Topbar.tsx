"use client";

import { useState } from "react";
import { Grid3X3Icon, ListIcon, MenuIcon, PlusIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { SearchBar } from "@/components/files/SearchBar";
import { Breadcrumb } from "@/components/files/Breadcrumb";
import { clearAllCaches } from "@/lib/cache";
import { useSidebar } from "@/components/providers/SidebarContext";

/**
 * Topbar — desktop-only sticky header.
 * On mobile/tablet, the sidebar drawer opens via the hamburger.
 * The bell/notification icon has been removed (no notification system yet).
 */
export function Topbar() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { toggle: toggleSidebar } = useSidebar();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const mode = params.get("mode") ?? "grid";

  const setMode = (nextMode: "grid" | "list") => {
    const next = new URLSearchParams(params.toString());
    next.set("mode", nextMode);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 md:gap-3 md:px-4">

      {/* ── Left: Hamburger (mobile/tablet) + Breadcrumb ────────────────── */}
      <div className={`flex min-w-0 items-center gap-2 transition-all ${searchExpanded ? "hidden sm:flex" : "flex"} lg:w-64`}>
        {/* Hamburger — hidden on desktop */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="touch-target shrink-0 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumb />
        </div>
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

      {/* ── Right: Actions ───────────────────────────────────────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">

        {/* Search icon — mobile only, expands search bar */}
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

        {/* New folder — md+ only */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("gitstore:new-folder"))}
          className="touch-target hidden rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 md:flex"
          aria-label="Create folder"
        >
          <PlusIcon className="h-4 w-4" />
        </button>

        {/* View toggles */}
        <button
          type="button"
          onClick={() => setMode("grid")}
          className={`touch-target rounded-xl ${mode === "grid" ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="Grid view"
          aria-pressed={mode === "grid"}
        >
          <Grid3X3Icon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`touch-target rounded-xl ${mode === "list" ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="List view"
          aria-pressed={mode === "list"}
        >
          <ListIcon className="h-4 w-4" />
        </button>

        {/* Avatar + sign-out */}
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
              <span className="text-xs font-semibold">{session?.user?.name?.slice(0, 1) ?? "U"}</span>
            )}
          </button>

          {avatarOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} aria-hidden />
              <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {session?.user?.name ?? "User"}
                  </p>
                  <p className="truncate text-[11px] text-gray-500">{session?.user?.email ?? ""}</p>
                </div>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={async () => {
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
