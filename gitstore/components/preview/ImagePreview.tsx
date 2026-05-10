"use client";

import { useEffect, useRef, useState } from "react";
import {
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  RotateCwIcon,
} from "lucide-react";

interface ImagePreviewProps {
  src: string;
  alt: string;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;
const ZOOM_BTN_STEP = 0.25;

/**
 * ImagePreview
 *
 * Features: zoom (wheel + buttons + Ctrl+wheel), pan (drag), rotate, fullscreen.
 *
 * Passive event fix:
 *   Modern browsers mark wheel/touchmove as passive by default to improve scroll
 *   performance. React's synthetic onWheel is also passive in React 17+. Calling
 *   e.preventDefault() inside a passive listener throws:
 *     "Unable to preventDefault inside passive event listener invocation"
 *
 *   Fix: attach a native wheel listener with { passive: false } via useEffect
 *   on the container ref, and remove the React synthetic onWheel handler entirely.
 *   This gives us full control to preventDefault (preventing page scroll while
 *   zooming) without the passive-listener constraint.
 *
 * Security: only accepts blob: or https: src (enforced upstream by isPreviewUrlSafe).
 */
export function ImagePreview({ src, alt }: ImagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Keep a stable ref to current offset/scale for use inside the wheel handler
  // without re-registering the event listener on every state change
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  // Reset on src change
  useEffect(() => {
    setScale(1);
    setRotate(0);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
  }, [src]);

  // ── Native wheel listener with passive:false ───────────────────────────────
  // This MUST be a native addEventListener — React synthetic onWheel is passive
  // in modern browsers and cannot call preventDefault().
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Only intercept when the image is in the container (always true here)
      // and when the user is hovering inside the container
      e.preventDefault(); // prevent page scroll — valid because passive:false
      e.stopPropagation();

      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setScale((s) => Math.min(Math.max(s + delta, MIN_SCALE), MAX_SCALE));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // stable — no deps needed (uses functional setState)

  // ── Mouse pan ─────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return; // only pan when zoomed
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onMouseUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const zoomIn  = () => setScale((s) => Math.min(s + ZOOM_BTN_STEP, MAX_SCALE));
  const zoomOut = () => setScale((s) => Math.max(s - ZOOM_BTN_STEP, MIN_SCALE));
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const rotateCw = () => setRotate((r) => (r + 90) % 360);

  const openFullscreen = () => {
    const img = containerRef.current?.querySelector("[data-preview-image]") as HTMLElement | null;
    if (img?.requestFullscreen) void img.requestFullscreen();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900/80 px-3 py-1.5 backdrop-blur">
        <button type="button" onClick={zoomOut} title="Zoom out (scroll down)" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition" aria-label="Zoom out">
          <ZoomOutIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="min-w-[3rem] rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 transition"
          title="Reset view"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={zoomIn} title="Zoom in (scroll up)" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition" aria-label="Zoom in">
          <ZoomInIcon className="h-4 w-4" />
        </button>
        <div className="h-4 w-px bg-gray-700 mx-1" />
        <button type="button" onClick={rotateCw} title="Rotate 90°" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition" aria-label="Rotate">
          <RotateCwIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={openFullscreen} title="Fullscreen" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition" aria-label="Fullscreen">
          <MaximizeIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Image container — native wheel listener attached here via ref */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center overflow-hidden rounded-xl select-none"
        style={{ maxHeight: "80vh", maxWidth: "90vw" }}
        // NO onWheel here — using native listener to allow preventDefault in non-passive mode
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 animate-pulse rounded-full bg-gray-700" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-preview-image
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotate}deg)`,
            cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in",
            transition: dragging ? "none" : "transform 0.12s ease-out",
            maxHeight: "80vh",
            maxWidth: "90vw",
            display: "block",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
      </div>

      {scale > 1 && (
        <p className="text-xs text-gray-600 select-none">
          Drag to pan · Scroll to zoom · Click % to reset
        </p>
      )}
    </div>
  );
}
