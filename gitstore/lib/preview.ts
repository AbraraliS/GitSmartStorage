/**
 * lib/preview.ts
 *
 * Canonical preview engine for GitStore.
 *
 * Blob architecture rules:
 *   - fetchFileBlob() returns the raw Blob (no objectUrl created here)
 *   - Object URLs created ONLY at render time by the component that needs them
 *   - Text/code parsers read directly from Blob via Blob.text()
 *   - PDF parsers read via blob.arrayBuffer() → pdf.js
 *   - Office parsers (docx/xlsx/pptx) read via blob.arrayBuffer() → mammoth/xlsx
 *   - NEVER do fetch(blobUrl) — that violates CSP connect-src
 *   - Binary files MUST use arrayBuffer() — never blob.text()
 *
 * Security:
 *   - isPreviewUrlSafe() validates URLs before any embed
 *   - Office HTML output is sanitized via DOMPurify before render
 *   - isBinaryContent() prevents accidental text-decode of binary data
 */

import type { FileRecord } from "@/types";

// ─── Preview Type Registry ────────────────────────────────────────────────────

export type PreviewType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "code"
  | "text"
  | "office-docx"
  | "office-xlsx"
  | "office-pptx"
  | "archive"
  | "unsupported";

export interface PreviewCapabilities {
  zoom: boolean;
  pan: boolean;
  fullscreen: boolean;
  searchable: boolean;
  streamable: boolean;
  editable: boolean;
  downloadable: boolean;
  pagination: boolean;
}

export interface PreviewMeta {
  type: PreviewType;
  mimeType: string;
  capabilities: PreviewCapabilities;
  language?: string;
  isTextual: boolean;
}

/** Raw Blob + optional objectUrl for media renderers */
export interface PreviewResource {
  blob: Blob;
  objectUrl: string | null;
  mimeType: string;
}

// ─── MIME + Extension Tables ─────────────────────────────────────────────────

const MIME_OVERRIDE: Record<string, string> = {
  // Images
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif",
  tiff: "image/tiff", tif: "image/tiff",
  // Video
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/mp4",
  // Audio
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4", opus: "audio/opus",
  // Documents
  pdf: "application/pdf",
  txt: "text/plain", md: "text/markdown", json: "application/json",
  yaml: "application/x-yaml", yml: "application/x-yaml",
  xml: "application/xml", csv: "text/csv", log: "text/plain",
  // Code
  js: "text/javascript", ts: "text/typescript", jsx: "text/javascript",
  tsx: "text/typescript", py: "text/x-python", rb: "text/x-ruby",
  rs: "text/x-rust", go: "text/x-go", java: "text/x-java",
  c: "text/x-c", cpp: "text/x-c++", cs: "text/x-csharp",
  php: "text/x-php", swift: "text/x-swift", kt: "text/x-kotlin",
  html: "text/html", css: "text/css", scss: "text/x-scss",
  sql: "text/x-sql", sh: "text/x-sh", bash: "text/x-sh",
  dockerfile: "text/plain", toml: "text/x-toml", ini: "text/plain", env: "text/plain",
  // Office
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  // Archives
  zip: "application/zip", tar: "application/x-tar", gz: "application/gzip",
  "7z": "application/x-7z-compressed", rar: "application/x-rar-compressed",
  bz2: "application/x-bzip2", xz: "application/x-xz",
};

export const SHIKI_LANG_MAP: Record<string, string> = {
  js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
  cpp: "cpp", c: "c", cs: "csharp", php: "php", swift: "swift", kt: "kotlin",
  html: "html", css: "css", scss: "scss", json: "json", xml: "xml",
  yaml: "yaml", yml: "yaml", sh: "bash", bash: "bash", sql: "sql",
  md: "markdown", txt: "text", toml: "toml", dockerfile: "dockerfile",
};

// ─── Type Detection ───────────────────────────────────────────────────────────

export function getExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

export function resolveMimeType(file: FileRecord): string {
  const stored = (file.type ?? "").trim();
  if (stored && stored !== "application/octet-stream") return stored;
  const ext = getExtension(file.name);
  return MIME_OVERRIDE[ext] ?? "application/octet-stream";
}

/**
 * Detects preview type for a file.
 * Office files (docx/xlsx/pptx) are classified separately to prevent
 * blob.text() being called on binary ZIP containers.
 */
export function detectPreviewType(file: FileRecord): PreviewType {
  const mime = resolveMimeType(file);
  const ext = getExtension(file.name);

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";

  // Office formats — binary ZIP containers; MUST use arrayBuffer(), never text()
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) return "office-docx";

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === "xlsx"
  ) return "office-xlsx";

  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) return "office-pptx";

  // Legacy Office formats (binary .doc/.xls/.ppt) — no client parse, show download
  if (
    ["doc", "xls", "ppt"].includes(ext) ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint"
  ) return "unsupported";

  // Archives
  if (
    ["zip", "tar", "gz", "7z", "rar", "bz2", "xz"].includes(ext) ||
    mime === "application/zip" || mime === "application/x-tar" ||
    mime === "application/gzip" || mime === "application/x-7z-compressed" ||
    mime === "application/x-rar-compressed" || mime === "application/x-bzip2" ||
    mime === "application/x-xz"
  ) return "archive";

  // Markdown
  if (
    mime.includes("markdown") || mime.startsWith("text/markdown") ||
    file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".mdx")
  ) return "markdown";

  // Code (text with known language)
  if (ext in SHIKI_LANG_MAP && ext !== "txt" && ext !== "log") return "code";

  // Generic text — only if MIME is confirmed textual
  if (
    mime.startsWith("text/") || mime.includes("json") ||
    mime.includes("javascript") || mime.includes("typescript") ||
    mime.includes("xml") || mime.includes("yaml") ||
    ["txt", "log", "csv", "env", "ini", "toml"].includes(ext)
  ) return "text";

  return "unsupported";
}

export function canPreview(file: FileRecord): boolean {
  return detectPreviewType(file) !== "unsupported";
}

export function getShikiLanguage(file: FileRecord): string | null {
  const ext = getExtension(file.name);
  return SHIKI_LANG_MAP[ext] ?? null;
}

export function getPreviewCapabilities(type: PreviewType): PreviewCapabilities {
  switch (type) {
    case "image":       return { zoom: true,  pan: true,  fullscreen: true,  searchable: false, streamable: false, editable: false, downloadable: true, pagination: false };
    case "video":       return { zoom: false, pan: false, fullscreen: true,  searchable: false, streamable: true,  editable: false, downloadable: true, pagination: false };
    case "audio":       return { zoom: false, pan: false, fullscreen: false, searchable: false, streamable: true,  editable: false, downloadable: true, pagination: false };
    case "pdf":         return { zoom: true,  pan: false, fullscreen: true,  searchable: true,  streamable: true,  editable: false, downloadable: true, pagination: true  };
    case "office-docx":
    case "office-xlsx":
    case "office-pptx": return { zoom: false, pan: false, fullscreen: true,  searchable: true,  streamable: false, editable: false, downloadable: true, pagination: false };
    case "markdown":
    case "code":
    case "text":        return { zoom: false, pan: false, fullscreen: true,  searchable: true,  streamable: false, editable: false, downloadable: true, pagination: false };
    case "archive":     return { zoom: false, pan: false, fullscreen: false, searchable: false, streamable: false, editable: false, downloadable: true, pagination: false };
    default:            return { zoom: false, pan: false, fullscreen: false, searchable: false, streamable: false, editable: false, downloadable: true, pagination: false };
  }
}

export function getPreviewMeta(file: FileRecord): PreviewMeta {
  const type = detectPreviewType(file);
  return {
    type,
    mimeType: resolveMimeType(file),
    capabilities: getPreviewCapabilities(type),
    language: getShikiLanguage(file) ?? undefined,
    isTextual: ["markdown", "code", "text"].includes(type),
  };
}

// ─── Binary Content Detection ─────────────────────────────────────────────────

/**
 * Samples the first 8 KB of a Blob and checks for null bytes or high
 * ratio of non-printable characters — reliable signal of binary content.
 *
 * Use this BEFORE calling blob.text() to avoid garbled output.
 */
export async function isBinaryContent(blob: Blob): Promise<boolean> {
  const sample = await blob.slice(0, 8192).arrayBuffer();
  const bytes = new Uint8Array(sample);
  let nonPrintable = 0;
  for (const byte of bytes) {
    // Null byte → definitely binary
    if (byte === 0) return true;
    // Control characters (except tab, newline, CR) indicate binary
    if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable++;
  }
  // >5% non-printable → binary
  return bytes.length > 0 && nonPrintable / bytes.length > 0.05;
}

// ─── URL Safety ───────────────────────────────────────────────────────────────

const SAFE_EMBED_PROTOCOLS = new Set(["blob:", "https:", "http:"]);

export function isPreviewUrlSafe(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    return SAFE_EMBED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

// ─── Object URL helpers ───────────────────────────────────────────────────────

export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

// ─── Download URL ─────────────────────────────────────────────────────────────

export function getDownloadUrl(hash: string): string {
  return `/api/files/download?hash=${encodeURIComponent(hash)}`;
}

// ─── Core Fetcher — returns raw Blob, no objectUrl ───────────────────────────

export async function fetchFileBlob(
  file: FileRecord,
  signal?: AbortSignal
): Promise<{ blob: Blob; mimeType: string } | { corrupted: true }> {
  const res = await fetch(getDownloadUrl(file.hash), { signal });

  if (res.status === 422) return { corrupted: true };

  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) msg = json.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const buffer = await res.arrayBuffer();
  const mimeType = resolveMimeType(file);
  const blob = new Blob([buffer], { type: mimeType });
  return { blob, mimeType };
}

// ─── Text helpers — direct Blob read, no fetch(blobUrl) ──────────────────────

const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB

export async function readBlobText(
  blob: Blob
): Promise<{ text: string; truncated: boolean }> {
  const truncated = blob.size > MAX_TEXT_PREVIEW_BYTES;
  const slice = truncated ? blob.slice(0, MAX_TEXT_PREVIEW_BYTES) : blob;
  const text = await slice.text();
  return { text, truncated };
}

/** @deprecated Use readBlobText */
export const readTextContent = readBlobText;

export async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

// ─── Syntax Highlighting (lazy Shiki) ────────────────────────────────────────

let _shikiPromise: Promise<typeof import("shiki")> | null = null;

async function getShiki() {
  if (!_shikiPromise) _shikiPromise = import("shiki");
  return _shikiPromise;
}

export async function highlightCode(code: string, lang: string): Promise<string | null> {
  try {
    const { codeToHtml } = await getShiki();
    return await codeToHtml(code, { lang, theme: "github-dark" });
  } catch {
    return null;
  }
}

// ─── Archive metadata ─────────────────────────────────────────────────────────

export interface ArchiveInfo {
  type: string;
  sizeFormatted: string;
  message: string;
}

export function getArchiveInfo(file: FileRecord): ArchiveInfo {
  const ext = getExtension(file.name).toUpperCase();
  const mb = file.size / (1024 * 1024);
  const sizeFormatted = mb >= 1 ? `${mb.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
  return {
    type: ext || "Archive",
    sizeFormatted,
    message: "Archive preview shows metadata only. Download to extract.",
  };
}

// ─── Legacy aliases ───────────────────────────────────────────────────────────

/** @deprecated Use fetchFileBlob */
export const fetchFileBlobUrl = fetchFileBlob;
