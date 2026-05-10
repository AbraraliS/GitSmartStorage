/**
 * lib/smart.ts
 *
 * Centralized smart collection engine for GitStore.
 * Provides intelligent file categorization, grouping, and discovery
 * without relying on the legacy `node` field or the Default sidebar section.
 *
 * All UI smart-folder rendering must consume this module exclusively.
 * No component should manually classify file types.
 */

import type { FileRecord, GitStoreIndex } from "@/types";

// ─── Smart Collection IDs ────────────────────────────────────────────────────

export type SmartCollectionId =
  | "images"
  | "videos"
  | "audio"
  | "documents"
  | "pdfs"
  | "code"
  | "archives"
  | "design"
  | "recent"
  | "favorites"
  | "large"
  | "encrypted"
  | "trash";

export interface SmartCollection {
  id: SmartCollectionId;
  label: string;
  icon: string; // Lucide icon name
  description: string;
  /** Dynamically computed — use getSmartCollections() to get populated count */
  count?: number;
  /** Route path for this collection */
  href: string;
  /** Whether this collection has files (used for showing/hiding in sidebar) */
  hasFiles?: boolean;
}

// ─── MIME Type → Category mappings ──────────────────────────────────────────

const MIME_MAP: Array<{ prefix: string; id: SmartCollectionId }> = [
  { prefix: "image/", id: "images" },
  { prefix: "video/", id: "videos" },
  { prefix: "audio/", id: "audio" },
  { prefix: "application/pdf", id: "pdfs" },
  { prefix: "application/zip", id: "archives" },
  { prefix: "application/x-tar", id: "archives" },
  { prefix: "application/gzip", id: "archives" },
  { prefix: "application/x-7z-compressed", id: "archives" },
  { prefix: "application/x-rar-compressed", id: "archives" },
  { prefix: "application/vnd.rar", id: "archives" },
  { prefix: "application/x-bzip2", id: "archives" },
  { prefix: "application/msword", id: "documents" },
  { prefix: "application/vnd.openxmlformats-officedocument.wordprocessingml", id: "documents" },
  { prefix: "application/vnd.ms-excel", id: "documents" },
  { prefix: "application/vnd.openxmlformats-officedocument.spreadsheetml", id: "documents" },
  { prefix: "application/vnd.ms-powerpoint", id: "documents" },
  { prefix: "application/vnd.openxmlformats-officedocument.presentationml", id: "documents" },
  { prefix: "application/rtf", id: "documents" },
  { prefix: "text/plain", id: "documents" },
  { prefix: "text/rtf", id: "documents" },
  { prefix: "text/markdown", id: "documents" },
  { prefix: "text/csv", id: "documents" },
  { prefix: "application/json", id: "code" },
  { prefix: "text/javascript", id: "code" },
  { prefix: "application/javascript", id: "code" },
  { prefix: "text/typescript", id: "code" },
  { prefix: "text/x-python", id: "code" },
  { prefix: "text/x-java", id: "code" },
  { prefix: "text/x-c", id: "code" },
  { prefix: "text/x-c++", id: "code" },
  { prefix: "text/x-rust", id: "code" },
  { prefix: "text/x-go", id: "code" },
  { prefix: "text/x-ruby", id: "code" },
  { prefix: "text/x-php", id: "code" },
  { prefix: "text/html", id: "code" },
  { prefix: "text/css", id: "code" },
  { prefix: "text/xml", id: "code" },
  { prefix: "application/xml", id: "code" },
  { prefix: "text/x-sh", id: "code" },
  { prefix: "application/x-sh", id: "code" },
  { prefix: "image/vnd.adobe.photoshop", id: "design" },
  { prefix: "image/x-xcf", id: "design" },
  { prefix: "application/x-figma", id: "design" },
  { prefix: "image/svg+xml", id: "design" },
  { prefix: "application/vnd.sketch", id: "design" },
];

const EXTENSION_MAP: Record<string, SmartCollectionId> = {
  // Images
  jpg: "images", jpeg: "images", png: "images", gif: "images",
  webp: "images", heic: "images", heif: "images", bmp: "images",
  tiff: "images", tif: "images", avif: "images", ico: "images",
  // Videos
  mp4: "videos", mkv: "videos", mov: "videos", avi: "videos",
  webm: "videos", flv: "videos", wmv: "videos", m4v: "videos",
  // Audio
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio",
  aac: "audio", m4a: "audio", opus: "audio", wma: "audio",
  // PDFs
  pdf: "pdfs",
  // Documents
  doc: "documents", docx: "documents", xls: "documents", xlsx: "documents",
  ppt: "documents", pptx: "documents", odt: "documents", ods: "documents",
  odp: "documents", txt: "documents", md: "documents", rtf: "documents",
  csv: "documents",
  // Code
  js: "code", ts: "code", jsx: "code", tsx: "code", py: "code",
  java: "code", c: "code", cpp: "code", cs: "code", go: "code",
  rs: "code", rb: "code", php: "code", swift: "code", kt: "code",
  html: "code", css: "code", scss: "code", json: "code", xml: "code",
  yaml: "code", yml: "code", toml: "code", sh: "code", bash: "code",
  // Archives
  zip: "archives", tar: "archives", gz: "archives", "7z": "archives",
  rar: "archives", bz2: "archives", xz: "archives",
  // Design
  psd: "design", ai: "design", sketch: "design", fig: "design",
  xd: "design", xcf: "design", svg: "design",
};

const LARGE_FILE_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB
const RECENT_DAYS = 7;

// ─── File Classification ──────────────────────────────────────────────────────

/**
 * Classify a single file into a smart collection.
 * MIME type is checked first; extension is used as fallback.
 */
export function detectFileCategory(file: FileRecord): SmartCollectionId {
  const mime = (file.type || "").toLowerCase().trim();

  // MIME-first classification
  for (const entry of MIME_MAP) {
    if (mime === entry.prefix || mime.startsWith(entry.prefix)) {
      return entry.id;
    }
  }

  // Extension fallback
  const ext = (file.name || "").toLowerCase().split(".").pop() ?? "";
  if (ext && ext in EXTENSION_MAP) {
    return EXTENSION_MAP[ext];
  }

  return "documents"; // default bucket
}

// ─── Collection Filters ───────────────────────────────────────────────────────

export function getImageFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "images"
  );
}

export function getVideoFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "videos"
  );
}

export function getAudioFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "audio"
  );
}

export function getDocumentFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "documents"
  );
}

export function getPDFFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "pdfs"
  );
}

export function getCodeFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "code"
  );
}

export function getArchiveFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "archives"
  );
}

export function getDesignFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === "design"
  );
}

export function getRecentFiles(
  index: GitStoreIndex,
  days = RECENT_DAYS
): FileRecord[] {
  const cutoff = Date.now() - days * 86400 * 1000;
  return Object.values(index.files)
    .filter((f) => !f.trashed && new Date(f.created).getTime() >= cutoff)
    .sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
    );
}

export function getFavoriteFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && f.starred === true
  );
}

export function getLargeFiles(
  index: GitStoreIndex,
  thresholdBytes = LARGE_FILE_THRESHOLD_BYTES
): FileRecord[] {
  return Object.values(index.files)
    .filter((f) => !f.trashed && f.size >= thresholdBytes)
    .sort((a, b) => b.size - a.size);
}

export function getEncryptedFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files).filter(
    (f) => !f.trashed && Boolean(f.iv || f.encryptionKey)
  );
}

export function getTrashedFiles(index: GitStoreIndex): FileRecord[] {
  return Object.values(index.files)
    .filter((f) => f.trashed === true)
    .sort(
      (a, b) =>
        new Date(a.trashedAt ?? a.created).getTime() -
        new Date(b.trashedAt ?? b.created).getTime()
    );
}

// ─── Group files by type ───────────────────────────────────────────────────

/**
 * Group an array of files by their smart category.
 * Returns a map of category → files.
 */
export function groupFilesByType(
  files: FileRecord[]
): Map<SmartCollectionId, FileRecord[]> {
  const map = new Map<SmartCollectionId, FileRecord[]>();

  for (const file of files) {
    if (file.trashed) continue;
    const cat = detectFileCategory(file);
    const existing = map.get(cat);
    if (existing) existing.push(file);
    else map.set(cat, [file]);
  }

  return map;
}

// ─── Get files for a smart collection ────────────────────────────────────────

/**
 * Returns files for a given smart collection ID.
 * Used by dashboard routing: /dashboard?view=smart&type=images etc.
 */
export function getSmartCollectionFiles(
  index: GitStoreIndex,
  id: SmartCollectionId
): FileRecord[] {
  const byCategory = Object.values(index.files).filter(
    (f) => !f.trashed && detectFileCategory(f) === id
  );

  switch (id) {
    case "images": return getImageFiles(index);
    case "videos": return getVideoFiles(index);
    case "audio": return getAudioFiles(index);
    case "documents": return getDocumentFiles(index);
    case "pdfs": return getPDFFiles(index);
    case "code": return getCodeFiles(index);
    case "archives": return getArchiveFiles(index);
    case "design": return getDesignFiles(index);
    case "recent": return getRecentFiles(index);
    case "favorites": return getFavoriteFiles(index);
    case "large": return getLargeFiles(index);
    case "encrypted": return getEncryptedFiles(index);
    case "trash": return getTrashedFiles(index);
    default: return byCategory;
  }
}

// ─── Smart Collections Manifest ───────────────────────────────────────────────

const COLLECTION_DEFINITIONS: SmartCollection[] = [
  {
    id: "images",
    label: "Images",
    icon: "ImageIcon",
    description: "Photos, screenshots, and graphics",
    href: "/dashboard?view=smart&type=images",
  },
  {
    id: "videos",
    label: "Videos",
    icon: "VideoIcon",
    description: "Video files of all formats",
    href: "/dashboard?view=smart&type=videos",
  },
  {
    id: "audio",
    label: "Audio",
    icon: "MusicIcon",
    description: "Music, podcasts, and recordings",
    href: "/dashboard?view=smart&type=audio",
  },
  {
    id: "documents",
    label: "Documents",
    icon: "FileTextIcon",
    description: "Word docs, spreadsheets, presentations",
    href: "/dashboard?view=smart&type=documents",
  },
  {
    id: "pdfs",
    label: "PDFs",
    icon: "BookOpenIcon",
    description: "PDF files",
    href: "/dashboard?view=smart&type=pdfs",
  },
  {
    id: "code",
    label: "Code",
    icon: "CodeIcon",
    description: "Source code and configuration files",
    href: "/dashboard?view=smart&type=code",
  },
  {
    id: "archives",
    label: "Archives",
    icon: "ArchiveIcon",
    description: "ZIP, TAR, and compressed files",
    href: "/dashboard?view=smart&type=archives",
  },
  {
    id: "design",
    label: "Design",
    icon: "PaletteIcon",
    description: "Figma, Photoshop, and design files",
    href: "/dashboard?view=smart&type=design",
  },
  {
    id: "recent",
    label: "Recent",
    icon: "ClockIcon",
    description: `Files uploaded in the last ${RECENT_DAYS} days`,
    href: "/dashboard?view=smart&type=recent",
  },
  {
    id: "favorites",
    label: "Favorites",
    icon: "StarIcon",
    description: "Starred files",
    href: "/dashboard?view=smart&type=favorites",
  },
  {
    id: "large",
    label: "Large Files",
    icon: "HardDriveIcon",
    description: "Files over 50 MB",
    href: "/dashboard?view=smart&type=large",
  },
  {
    id: "encrypted",
    label: "Encrypted",
    icon: "LockIcon",
    description: "Client-side encrypted files",
    href: "/dashboard?view=smart&type=encrypted",
  },
];

/**
 * Returns all smart collections with live counts from the index.
 * Only collections with at least one file are marked hasFiles: true.
 * Memoization is the caller's responsibility (useMemo in components).
 *
 * Complexity: O(F) where F = number of files.
 */
export function getSmartCollections(
  index: GitStoreIndex
): SmartCollection[] {
  // Build count map in a single pass
  const counts = new Map<SmartCollectionId, number>();

  for (const file of Object.values(index.files)) {
    if (file.trashed) continue;
    const cat = detectFileCategory(file);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  // Special collections that don't map to detectFileCategory
  const recentCount = getRecentFiles(index).length;
  const favCount = getFavoriteFiles(index).length;
  const largeCount = getLargeFiles(index).length;
  const encryptedCount = getEncryptedFiles(index).length;

  return COLLECTION_DEFINITIONS.map((def) => {
    let count: number;
    switch (def.id) {
      case "recent": count = recentCount; break;
      case "favorites": count = favCount; break;
      case "large": count = largeCount; break;
      case "encrypted": count = encryptedCount; break;
      default: count = counts.get(def.id) ?? 0;
    }
    return { ...def, count, hasFiles: count > 0 };
  });
}

/**
 * Returns only smart collections that have at least one file.
 * Use this for sidebar rendering to avoid showing empty categories.
 */
export function getActiveSmartCollections(
  index: GitStoreIndex
): SmartCollection[] {
  return getSmartCollections(index).filter((c) => (c.count ?? 0) > 0);
}
