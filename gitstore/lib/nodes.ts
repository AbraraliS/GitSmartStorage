import type { GitStoreIndex } from "@/types";

export const NODE_DEFINITIONS = {
  photos: {
    label: "Photos",
    icon: "ImageIcon",
    mimes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/heic",
    ],
  },
  videos: {
    label: "Videos",
    icon: "VideoIcon",
    mimes: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  },
  audio: {
    label: "Audio",
    icon: "MusicIcon",
    mimes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac"],
  },
  documents: {
    label: "Documents",
    icon: "FileTextIcon",
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  code: {
    label: "Code",
    icon: "CodeIcon",
    mimes: [
      "text/javascript",
      "text/typescript",
      "application/json",
      "text/html",
      "text/css",
      "text/x-python",
      "text/x-java-source",
      "application/xml",
    ],
  },
  notes: {
    label: "Notes",
    icon: "FileIcon",
    mimes: ["text/plain", "text/markdown"],
  },
  archives: {
    label: "Archives",
    icon: "ArchiveIcon",
    mimes: [
      "application/zip",
      "application/x-tar",
      "application/gzip",
      "application/x-7z-compressed",
      "application/x-rar-compressed",
    ],
  },
  other: {
    label: "Other",
    icon: "FolderIcon",
    mimes: [],
  },
} as const;

export type NodeId = keyof typeof NODE_DEFINITIONS;

export function classifyFile(mimeType: string): NodeId {
  for (const [nodeId, def] of Object.entries(NODE_DEFINITIONS)) {
    if ((def.mimes as readonly string[]).includes(mimeType)) return nodeId as NodeId;
  }
  return "other";
}

export function ensureNodeExists(index: GitStoreIndex, nodeId: NodeId): boolean {
  return nodeId in index.nodes;
}
