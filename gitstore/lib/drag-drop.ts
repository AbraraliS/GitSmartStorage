/**
 * lib/drag-drop.ts
 *
 * Drag-and-drop detection utilities for GitStore.
 *
 * Core problem this solves:
 *   The browser fires dragenter/dragover for ALL drag interactions —
 *   including text selection, element dragging, and OS file drags.
 *   Without validation, the upload overlay activates for everything.
 *
 * Solution:
 *   1. Detect real OS/browser file drags via dataTransfer.types
 *   2. Tag internal GitStore drags with a custom MIME marker
 *   3. Reject any drag that has the internal marker
 *
 * Architecture:
 *   - lib/drag-drop.ts  ← this file (pure detection logic, no React)
 *   - DropZone.tsx      ← calls isExternalFileDrag() before activating
 *   - FileCard.tsx      ← calls markInternalDrag() on dragstart of folders
 *   - Future DnD        ← always calls markInternalDrag() on dragstart
 */

/** MIME type used to mark GitStore-internal drag events */
export const GITSTORE_INTERNAL_TYPE = "application/x-gitstore-internal";

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns true if the drag event contains real OS or browser files.
 *
 * `dataTransfer.types` is always readable during dragenter/dragover
 * (even though .files is not). "Files" appears only when the drag source
 * is the operating system file manager, a browser file-open dialog result,
 * or a downloaded file from another browser tab.
 *
 * Does NOT rely on .files.length because browsers return 0 during
 * dragenter/dragover for security reasons.
 */
export function containsFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  // dt.types is a DOMStringList (not Array) in some browsers — iterate safely
  for (let i = 0; i < dt.types.length; i++) {
    if (dt.types[i] === "Files") return true;
  }
  return false;
}

/**
 * Returns true if this drag was tagged as a GitStore-internal drag.
 *
 * Internal drags must call markInternalDrag(event) during their onDragStart.
 * The MIME type is only readable (not the value) during enter/over due to
 * browser security — but its presence alone is sufficient to detect internal.
 */
export function isInternalDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  for (let i = 0; i < dt.types.length; i++) {
    if (dt.types[i] === GITSTORE_INTERNAL_TYPE) return true;
  }
  return false;
}

/**
 * Returns true if this drag event contains the GitStore-internal tag.
 */
export function containsGitStoreDrag(event: DragEvent | React.DragEvent): boolean {
  const dt = event.dataTransfer as DataTransfer | null | undefined;
  return isInternalDrag(dt);
}

/**
 * Returns true if the drag event contains real external files.
 */
export function containsRealExternalFiles(event: DragEvent | React.DragEvent): boolean {
  const dt = event.dataTransfer as DataTransfer | null | undefined;
  return containsFiles(dt);
}

/**
 * Returns true ONLY for genuine external file drags that should activate
 * the upload overlay.
 *
 * Priority:
 *   1. If internal tag exists -> ALWAYS false (even if browser injected "Files")
 *   2. Otherwise -> check for external files
 */
export function isExternalFileDrag(event: DragEvent): boolean {
  if (containsGitStoreDrag(event)) {
    return false;
  }
  return containsRealExternalFiles(event);
}

// ─── Tagging ──────────────────────────────────────────────────────────────────

/**
 * Marks a drag event as a GitStore-internal operation.
 *
 * Call this inside the onDragStart handler of ANY draggable GitStore element:
 *   - File cards / rows
 *   - Folder cards / rows
 *   - Selection groups
 *   - Move targets
 *
 * This prevents DropZone from treating the drag as an upload.
 *
 * The value is ignored by all detection code — only the MIME type's presence
 * matters (browsers only expose type keys, not values, during enter/over).
 */
export function markInternalDrag(event: DragEvent): void {
  try {
    event.dataTransfer?.setData(GITSTORE_INTERNAL_TYPE, "1");
  } catch {
    // setData can throw in some edge cases — swallow silently
  }
}

/**
 * React-compatible wrapper for use in onDragStart JSX handlers.
 * Use this instead of the raw DragEvent version.
 */
export function markInternalDragReact(
  event: React.DragEvent<HTMLElement>
): void {
  try {
    event.dataTransfer.setData(GITSTORE_INTERNAL_TYPE, "1");
  } catch {
    // swallow
  }
}

// ─── Drop helpers ─────────────────────────────────────────────────────────────

/**
 * Extracts File objects from a drop event.
 * Always returns an empty array for internal drags (safety guard).
 */
export function getDroppedFiles(event: DragEvent): File[] {
  if (isInternalDrag(event.dataTransfer)) return [];
  return Array.from(event.dataTransfer?.files ?? []);
}

/**
 * React-compatible version of getDroppedFiles.
 */
export function getDroppedFilesReact(
  event: React.DragEvent<HTMLElement>
): File[] {
  if (isInternalDrag(event.dataTransfer as unknown as DataTransfer)) return [];
  return Array.from(event.dataTransfer?.files ?? []);
}

/**
 * Prevents the browser's default drop behavior (opening the file).
 * Should be called in ALL dragover handlers to prevent browser navigation.
 */
export function preventBrowserDrop(event: DragEvent | React.DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
