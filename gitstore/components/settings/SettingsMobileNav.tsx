"use client";

/**
 * components/settings/SettingsMobileNav.tsx
 *
 * Mobile-only top bar for the Settings section.
 * Shows:
 *   - On /settings root: "Settings" title with back-to-dashboard button
 *   - On sub-pages: acts as the mobile page header (sub-pages render their
 *     own MobileHeader independently, so this component only adds the
 *     settings-root header on the overview page)
 *
 * Rendered inside SettingsLayout, visible only on < lg screens.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

export function SettingsMobileNav() {
  const pathname = usePathname();
  const isRoot = pathname === "/settings";

  // Sub-pages render their own MobileHeader; this component only handles root
  if (!isRoot) return null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-950 px-3 lg:hidden">
      <Link
        href="/dashboard"
        className="touch-target flex shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        aria-label="Back to files"
      >
        <ArrowLeftIcon className="h-5 w-5" />
      </Link>
      <h1 className="flex-1 truncate text-center text-[15px] font-semibold text-gray-100">
        Settings
      </h1>
      {/* Spacer to center the title */}
      <span className="w-11 shrink-0" aria-hidden />
    </header>
  );
}
