"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

function toTitle(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Breadcrumb() {
  const params = useSearchParams();
  const node = params.get("node");
  const folder = params.get("folder") ?? "/";

  const segments: Array<{ label: string; href?: string }> = [{ label: "My Files", href: "/dashboard" }];

  if (node) {
    const nodeHref = `/dashboard?node=${node}`;
    segments.push({ label: toTitle(node), href: nodeHref });

    if (folder !== "/") {
      const parts = folder.split("/").filter(Boolean);
      let path = "";
      parts.forEach((part, idx) => {
        path = path ? `${path}/${part}` : part;
        const isLast = idx === parts.length - 1;
        segments.push({
          label: part,
          href: isLast ? undefined : `/dashboard?node=${node}&folder=${encodeURIComponent(path)}`,
        });
      });
    }
  }

  const mobileSegments = segments.length > 3
    ? [segments[0], { label: "..." }, segments[segments.length - 1]]
    : segments;

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      {mobileSegments.map((segment, index) => {
        const isLast = index === mobileSegments.length - 1;
        return (
          <span key={`${segment.label}-${index}`} className="flex items-center gap-2">
            {segment.href && !isLast ? (
              <Link href={segment.href} className="hover:text-gray-800 dark:hover:text-gray-200">
                {segment.label}
              </Link>
            ) : (
              <span className={isLast ? "text-gray-900 dark:text-gray-100" : ""}>{segment.label}</span>
            )}
            {!isLast && <span>&gt;</span>}
          </span>
        );
      })}
    </nav>
  );
}
