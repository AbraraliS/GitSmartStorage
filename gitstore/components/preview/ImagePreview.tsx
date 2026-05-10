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

/**
 * ImagePreview
 * Features: zoom (wheel + buttons), pan (drag), rotate, fullscreen, lazy loading.
 * Security: only accepts blob: or https: src (enforced by lib/preview isPreviewUrlSafe).
 */
export function ImagePreview({ src, alt }: ImagePreviewProps) {
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Reset on src change
  useEffect(() => {
    setScale(1);
    setRotate(0);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
  }, [src]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const rotateCw = () => setRotate((r) => (r + 90) % 360);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.25), 5));
  };

  const onMouseDown = (e: React.MouseEvent) => {
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

  const openFullscreen = () => {
    const img = document.querySelector("[data-preview-image]") as HTMLElement;
    if (img?.requestFullscreen) void img.requestFullscreen();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900/80 px-3 py-1.5 backdrop-blur">
        <button type="button" onClick={zoomOut} title="Zoom out" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          <ZoomOutIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={resetView} className="min-w-10 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 transition">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={zoomIn} title="Zoom in" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          <ZoomInIcon className="h-4 w-4" />
        </button>
        <div className="h-4 w-px bg-gray-700 mx-1" />
        <button type="button" onClick={rotateCw} title="Rotate 90°" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          <RotateCwIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={openFullscreen} title="Fullscreen" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          <MaximizeIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Image area */}
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-xl"
        style={{ maxHeight: "80vh", maxWidth: "90vw" }}
        onWheel={onWheel}
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
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotate}deg)`,
            cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "default",
            transition: dragging ? "none" : "transform 0.15s ease",
            maxHeight: "80vh",
            maxWidth: "90vw",
            display: "block",
            userSelect: "none",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
