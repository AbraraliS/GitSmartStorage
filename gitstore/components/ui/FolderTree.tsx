"use client";

import { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import type { GitStoreIndex } from "@/types";
import { buildFileTree } from "@/lib/filesystem";

// ─── Picker folder node type ──────────────────────────────────────────────────

export interface PickerFolderNode {
  path: string;
  name: string;
  parent: string;
  children: PickerFolderNode[];
}

/** @deprecated Use buildFileTree from lib/filesystem instead */
export interface FolderNode extends PickerFolderNode {}

/**
 * Builds a picker-compatible folder tree from the filesystem engine.
 * All folders visible in the virtual filesystem are included.
 */
export function buildFolderTree(index: GitStoreIndex): PickerFolderNode[] {
  const tree = buildFileTree(index);

  const toPickerNode = (path: string): PickerFolderNode | null => {
    const node = tree.nodes.get(path);
    if (!node || node.type !== "folder") return null;
    const childFolders = node.children
      .filter((c) => tree.nodes.get(c)?.type === "folder")
      .map((c) => toPickerNode(c))
      .filter((n): n is PickerFolderNode => n !== null);
    return {
      path: node.path,
      name: node.name,
      parent: node.parentPath ?? "/",
      children: childFolders,
    };
  };

  return tree.rootChildren
    .filter((p) => tree.nodes.get(p)?.type === "folder")
    .map((p) => toPickerNode(p))
    .filter((n): n is PickerFolderNode => n !== null);
}

export function flattenTree(roots: PickerFolderNode[]): string[] {
  const result: string[] = [];
  const collect = (nodes: PickerFolderNode[]) => {
    nodes.forEach((n) => {
      result.push(n.path);
      collect(n.children);
    });
  };
  collect(roots);
  return result;
}

// ─── Tree item ────────────────────────────────────────────────────────────────

function FolderTreeItem({
  node,
  selected,
  onSelect,
  depth,
  disabledPaths,
  highlightPath,
}: {
  node: PickerFolderNode;
  selected: string;
  onSelect: (path: string) => void;
  depth: number;
  disabledPaths?: Set<string>;
  highlightPath?: string;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selected === node.path;
  const hasChildren = node.children.length > 0;
  const isDisabled = disabledPaths?.has(node.path) ?? false;
  const isHighlighted = highlightPath === node.path;

  return (
    <div>
      <div
        className="flex w-full items-center gap-2"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            aria-label={expanded ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => !isDisabled && onSelect(node.path)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            isDisabled
              ? "cursor-not-allowed opacity-40 text-gray-500"
              : isSelected
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
              : isHighlighted
              ? "bg-emerald-500/10 text-gray-200 ring-1 ring-emerald-500/20"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          {isSelected ? (
            <FolderOpenIcon className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <FolderIcon
              className={`h-4 w-4 shrink-0 ${isDisabled ? "text-gray-600" : "text-amber-400"}`}
            />
          )}
          <span className="truncate">{node.name}</span>

          {isSelected && (
            <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
              disabledPaths={disabledPaths}
              highlightPath={highlightPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface FolderTreeProps {
  index: GitStoreIndex;
  selected: string;
  onSelect: (path: string) => void;
  disabledPaths?: Set<string>;
  /** Show a "Root (no folder)" option at the top */
  showRoot?: boolean;
  /** If set, only render folders whose path contains this query (case-insensitive) */
  searchQuery?: string;
  /** Path of the folder to flash with a highlight (e.g. just after creation) */
  highlightPath?: string;
}

export function FolderTree({
  index,
  selected,
  onSelect,
  disabledPaths,
  showRoot = false,
  searchQuery = "",
  highlightPath,
}: FolderTreeProps) {
  const folderTree = useMemo(() => buildFolderTree(index), [index]);
  const allPaths = useMemo(() => flattenTree(folderTree), [folderTree]);

  const filteredPaths = searchQuery.trim()
    ? allPaths.filter((p) =>
        p.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  return (
    <div>
      {/* Root option */}
      {showRoot && !searchQuery.trim() && (
        <button
          type="button"
          onClick={() => onSelect("/")}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            selected === "/"
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
              : "text-gray-400 hover:bg-gray-800"
          }`}
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-gray-500" />
          <span>Root (no specific folder)</span>
          {selected === "/" && (
            <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
        </button>
      )}

      {/* Search results or tree */}
      {filteredPaths ? (
        filteredPaths.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-gray-600">
            No folders match &quot;{searchQuery}&quot;
          </p>
        ) : (
          filteredPaths.map((path) => {
            const isDisabled = disabledPaths?.has(path) ?? false;
            const name = path.split("/").pop() ?? path;
            return (
              <button
                key={path}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onSelect(path)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isDisabled
                    ? "cursor-not-allowed opacity-40 text-gray-500"
                    : selected === path
                    ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <FolderIcon
                  className={`h-4 w-4 shrink-0 ${isDisabled ? "text-gray-600" : "text-amber-400"}`}
                />
                <span className="truncate">{path}</span>
                {selected === path && !isDisabled && (
                  <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
              </button>
            );
          })
        )
      ) : folderTree.length === 0 && !showRoot ? (
        <p className="px-3 py-6 text-center text-sm text-gray-600">
          No folders yet. Create one below.
        </p>
      ) : (
        folderTree.map((node) => (
          <FolderTreeItem
            key={node.path}
            node={node}
            selected={searchQuery ? "" : selected}
            onSelect={onSelect}
            depth={0}
            disabledPaths={disabledPaths}
            highlightPath={highlightPath}
          />
        ))
      )}
    </div>
  );
}
