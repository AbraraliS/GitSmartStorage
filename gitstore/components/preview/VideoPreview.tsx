"use client";

import { useRef, useState } from "react";
import { MaximizeIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

interface VideoPreviewProps {
  src: string;
  fileName: string;
}

/**
 * VideoPreview
 * Features: native video controls, fullscreen, muted toggle, auto play.
 * Uses blob: URL — never chrome-extension:// or untrusted sources.
 */
export function VideoPreview({ src, fileName }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  const openFullscreen = () => {
    if (videoRef.current?.requestFullscreen) void videoRef.current.requestFullscreen();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(!muted);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900/80 px-3 py-1.5 backdrop-blur">
        <button type="button" onClick={toggleMute} title={muted ? "Unmute" : "Mute"} className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          {muted ? <VolumeXIcon className="h-4 w-4" /> : <Volume2Icon className="h-4 w-4" />}
        </button>
        <button type="button" onClick={openFullscreen} title="Fullscreen" className="rounded p-1.5 text-gray-300 hover:bg-gray-700 transition">
          <MaximizeIcon className="h-4 w-4" />
        </button>
      </div>
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        playsInline
        aria-label={fileName}
        className="max-h-[80vh] max-w-[90vw] rounded-xl bg-black"
        style={{ outline: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
