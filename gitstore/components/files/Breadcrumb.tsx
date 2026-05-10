"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NODE_DEFINITIONS } from "@/lib/nodes";

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

function toTitle(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Breadcrumb() {
  const params = useSearchParams();
  const node = params.get("node");
  const view = params.get("view") ?? "";
  const path = params.get("path") ?? "";
  const smartType = params.get("type") ?? "";
  const smartValue = params.get("value") ?? "";

  const segments: Array<{ label: string; href?: string }> = [{ label: "My Files", href: "/dashboard" }];

  if (node) {
    const nodeLabel = NODE_DEFINITIONS[node as keyof typeof NODE_DEFINITIONS]?.label ?? toTitle(node);
    segments.push({ label: "Default", href: "/dashboard?view=folder" });
    segments.push({ label: nodeLabel });
  } else if (view === "folder" && path) {
    const parts = path.split("/").filter(Boolean);
    let currentPath = "";
    parts.forEach((part, idx) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = idx === parts.length - 1;
      segments.push({
        label: part,
        href: isLast ? undefined : `/dashboard?view=folder&path=${encodeURIComponent(currentPath)}`,
      });
    });
  } else if (view === "smart") {
    segments.push({ label: "Smart", href: "/dashboard?view=folder" });
    if (smartType === "month") {
      segments.push({ label: formatMonth(smartValue) });
    } else if (smartType === "tag") {
      segments.push({ label: `#${smartValue}` });
    } else if (smartType === "node") {
      const nodeLabel = NODE_DEFINITIONS[smartValue as keyof typeof NODE_DEFINITIONS]?.label ?? toTitle(smartValue);
      segments.push({ label: nodeLabel });
    } else if (smartType === "starred") {
      segments.push({ label: "Starred" });
    }
  } else if (view === "recent") {
    segments.push({ label: "Recent" });
  } else if (view === "trash") {
    segments.push({ label: "Trash" });
  } else if (view === "starred") {
    segments.push({ label: "Starred" });
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
