"use client";

interface NodeBadgeProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function NodeBadge({ label, active, onClick }: NodeBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
      }`}
    >
      {label}
    </button>
  );
}
