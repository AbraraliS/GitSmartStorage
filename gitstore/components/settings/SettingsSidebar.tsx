"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  DatabaseIcon,
  HardDriveIcon,
  LayoutGridIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldIcon,
} from "lucide-react";

interface SettingsNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isDanger?: boolean;
}

const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/settings", label: "Overview", icon: LayoutGridIcon },
  { href: "/settings/nodes", label: "Connected Nodes", icon: ServerIcon },
  { href: "/settings/storage", label: "Storage", icon: HardDriveIcon },
  { href: "/settings/sync", label: "Sync & Backup", icon: RefreshCwIcon },
  { href: "/settings/security", label: "Security", icon: ShieldIcon },
  { href: "/settings/cache", label: "Cache", icon: DatabaseIcon },
];

const DANGER_NAV: SettingsNavItem = {
  href: "/settings/danger-zone",
  label: "Danger Zone",
  icon: AlertTriangleIcon,
  isDanger: true,
};

export function SettingsSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-gray-800 bg-gray-950 p-5 md:flex md:flex-col">
      {/* Back to dashboard */}
      <Link
        href="/dashboard"
        className="mb-6 flex items-center gap-2 text-sm text-gray-400 transition hover:text-gray-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Files
      </Link>

      <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Settings
      </p>

      <nav className="flex-1 space-y-1">
        {SETTINGS_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-gray-800 text-gray-100"
                  : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Danger zone — visually separated, lower priority */}
      <div className="mt-4 border-t border-gray-800 pt-4">
        <Link
          href={DANGER_NAV.href}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
            isActive(DANGER_NAV.href)
              ? "bg-red-950/40 text-red-400"
              : "text-gray-600 hover:bg-red-950/20 hover:text-red-400"
          }`}
        >
          <AlertTriangleIcon className="h-4 w-4 shrink-0" />
          Danger Zone
        </Link>
      </div>
    </aside>
  );
}
