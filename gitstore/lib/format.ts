/**
 * lib/format.ts
 * Formatting utilities for file sizes, dates, and MIME icons.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function getMimeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎥";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("text/")) return "📝";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gz")) return "🗜️";
  if (mimeType.includes("json") || mimeType.includes("xml")) return "📋";
  if (mimeType.includes("javascript") || mimeType.includes("typescript")) return "📜";
  return "📁";
}

export function getMimeColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "text-pink-400";
  if (mimeType.startsWith("video/")) return "text-purple-400";
  if (mimeType.startsWith("audio/")) return "text-blue-400";
  if (mimeType === "application/pdf") return "text-red-400";
  if (mimeType.startsWith("text/")) return "text-green-400";
  return "text-gray-400";
}
