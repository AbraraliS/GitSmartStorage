"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { GitStoreIndex } from "@/types";

interface FolderPickerDialogProps {
  index: GitStoreIndex;
  onConfirm: (folderPath: string) => void;
  onCancel: () => void;
  fileNames?: string[]; // files being uploaded, for display
}

interface FolderNode {
  path: string;
  name: string;
  parent: string;
  children: FolderNode[];
}

function buildFolderTree(index: GitStoreIndex): FolderNode[] {
  const folders = index.folders ?? {};
  const allPaths = new Set<string>();

  // Collect all unique folder paths from folder metadata
  Object.keys(folders).forEach((p) => allPaths.add(p));

  // Also collect from files' folders arrays
  Object.values(index.files).forEach((f) => {
    (f.folders ?? []).forEach((fp) => {
      if (fp && fp !== "/") allPaths.add(fp);
    });
  });

  // Build tree nodes
  const nodeMap = new Map<string, FolderNode>();

  allPaths.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? path;
    const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    nodeMap.set(path, { path, name, parent, children: [] });
  });

  // Link children to parents
  const roots: FolderNode[] = [];
  nodeMap.forEach((node) => {
    if (node.parent === "/") {
      roots.push(node);
    } else {
      const parentNode = nodeMap.get(node.parent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  // Sort alphabetically
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

function FolderTreeItem({
  node,
  selected,
  onSelect,
  depth,
}: {
  node: FolderNode;
  selected: string;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selected === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
            : "text-gray-300 hover:bg-gray-800"
        }`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0 text-gray-500 hover:text-gray-300"
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {isSelected ? (
          <FolderOpenIcon className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0 text-amber-400" />
        )}
        <span className="truncate">{node.name}</span>

        {isSelected && (
          <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
      </button>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderPickerDialog({
  index,
  onConfirm,
  onCancel,
  fileNames = [],
}: FolderPickerDialogProps) {
  const [selected, setSelected] = useState<string>("/");
  const [search, setSearch] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");

  const folderTree = useMemo(() => buildFolderTree(index), [index]);

  // Flat list for search
  const allFolderPaths = useMemo(() => {
    const paths: string[] = [];
    const collect = (nodes: FolderNode[]) => {
      nodes.forEach((n) => {
        paths.push(n.path);
        collect(n.children);
      });
    };
    collect(folderTree);
    return paths;
  }, [folderTree]);

  const filteredPaths = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return allFolderPaths.filter((p) => p.toLowerCase().includes(q));
  }, [search, allFolderPaths]);

  const handleConfirm = useCallback(() => {
    // If creating new folder, use that path
    if (creatingNew && newFolderName.trim()) {
      const base = selected === "/" ? "" : selected + "/";
      const fullPath = base + newFolderName.trim();
      onConfirm(fullPath);
    } else {
      onConfirm(selected);
    }
  }, [creatingNew, newFolderName, selected, onConfirm]);

  const handleNewFolderInput = (val: string) => {
    setNewFolderName(val);
    if (val.includes("..") || val.startsWith("/")) {
      setNewFolderError("Invalid folder name");
    } else {
      setNewFolderError("");
    }
  };

  const selectedLabel =
    creatingNew && newFolderName.trim()
      ? (selected === "/" ? "" : selected + "/") + newFolderName.trim()
      : selected === "/"
      ? "Root (no folder)"
      : selected;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">
              Upload destination
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {fileNames.length > 0
                ? fileNames.length === 1
                  ? `Uploading "${fileNames[0]}"`
                  : `Uploading ${fileNames.length} files`
                : "Choose where to save files"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folders…"
              className="w-full bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none"
            />
          </div>
        </div>

        {/* Folder tree / search results */}
        <div className="max-h-64 overflow-y-auto px-2 py-2">
          {/* Root option */}
          {!search.trim() && (
            <button
              type="button"
              onClick={() => { setSelected("/"); setCreatingNew(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selected === "/" && !creatingNew
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "text-gray-400 hover:bg-gray-800"
              }`}
            >
              <FolderIcon className="h-4 w-4 shrink-0 text-gray-500" />
              <span>Root (no specific folder)</span>
              {selected === "/" && !creatingNew && (
                <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
            </button>
          )}

          {/* Tree or search results */}
          {filteredPaths ? (
            filteredPaths.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-600">
                No folders match "{search}"
              </p>
            ) : (
              filteredPaths.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => { setSelected(path); setCreatingNew(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selected === path && !creatingNew
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate">{path}</span>
                  {selected === path && !creatingNew && (
                    <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  )}
                </button>
              ))
            )
          ) : folderTree.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-600">
              No folders yet. Create one below.
            </p>
          ) : (
            folderTree.map((node) => (
              <FolderTreeItem
                key={node.path}
                node={node}
                selected={creatingNew ? "" : selected}
                onSelect={(p) => { setSelected(p); setCreatingNew(false); }}
                depth={0}
              />
            ))
          )}
        </div>

        {/* Create new folder */}
        <div className="border-t border-gray-800 px-4 py-3">
          {creatingNew ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Creating inside:{" "}
                <span className="text-gray-300">
                  {selected === "/" ? "Root" : selected}
                </span>
              </p>
              <div className="flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => handleNewFolderInput(e.target.value)}
                  placeholder="Folder name (e.g. Japan)"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-emerald-500/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim() && !newFolderError) handleConfirm();
                    if (e.key === "Escape") setCreatingNew(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
              {newFolderError && (
                <p className="text-xs text-red-400">{newFolderError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              <FolderPlusIcon className="h-4 w-4" />
              New folder
              {selected !== "/" && (
                <span className="ml-1 text-xs text-gray-600">
                  inside {selected.split("/").pop()}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-800 px-5 py-4">
          <p className="text-xs text-gray-500 truncate max-w-[55%]">
            → <span className="text-gray-300">{selectedLabel || "Root"}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={creatingNew && (!newFolderName.trim() || !!newFolderError)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Upload here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}