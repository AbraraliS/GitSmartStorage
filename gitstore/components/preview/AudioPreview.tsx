"use client";

import { useRef } from "react";
import { MusicIcon } from "lucide-react";

interface AudioPreviewProps {
  src: string;
  fileName: string;
  fileSize: number;
}

/**
 * AudioPreview
 * Features: native audio controls, waveform-ready architecture.
 * Waveform visualization placeholder — upgrade to Web Audio API later.
 */
export function AudioPreview({ src, fileName, fileSize }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="flex w-80 max-w-[90vw] flex-col items-center gap-6 rounded-2xl border border-gray-800 bg-gray-900 px-8 py-10">
      {/* Waveform placeholder — replace with real waveform when Web Audio API is added */}
      <div className="flex h-16 w-full items-end justify-center gap-0.5" aria-hidden>
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-blue-500/40"
            style={{ height: `${20 + Math.sin(i * 0.6) * 28 + Math.random() * 15}%` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-950/40 p-3">
          <MusicIcon className="h-6 w-6 text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-100">{fileName}</p>
          <p className="text-xs text-gray-500">{sizeMb} MB</p>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        controls
        aria-label={fileName}
        className="w-full"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}
