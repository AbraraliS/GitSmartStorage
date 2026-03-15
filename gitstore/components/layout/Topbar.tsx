"use client";

import { useState } from "react";
import { BellIcon, Grid3X3Icon, ListIcon, MenuIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { SearchBar } from "@/components/files/SearchBar";
import { Breadcrumb } from "@/components/files/Breadcrumb";
import { clearAllCaches } from "@/lib/cache";

export function Topbar() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const mode = params.get("mode") ?? "grid";

  const setMode = (nextMode: "grid" | "list") => {
    const next = new URLSearchParams(params.toString());
    next.set("mode", nextMode);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <header className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 md:px-4">
      <div className="flex min-w-0 items-center gap-3 md:w-72">
        <button
          type="button"
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <Breadcrumb />
        </div>
      </div>

      <SearchBar />

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("gitstore:new-folder"))}
          className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 md:inline-flex"
          aria-label="Create folder"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode("grid")}
          className={`rounded-lg p-2 ${mode === "grid" ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="Grid view"
        >
          <Grid3X3Icon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`rounded-lg p-2 ${mode === "list" ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
          aria-label="List view"
        >
          <ListIcon className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Notifications">
          <BellIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-1 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-semibold">{session?.user?.name?.slice(0, 1) ?? "U"}</span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={async () => {
                  await clearAllCaches();
                  await signOut({ callbackUrl: "/" });
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
