"use client";

import { useState } from "react";
import type { FilterOptions } from "@/types";

interface FilterPanelProps {
  filters: FilterOptions;
  onChange: (f: FilterOptions) => void;
}

const FILE_TYPES = [
  { label: "All", value: "" },
  { label: "Images", value: "image" },
  { label: "Videos", value: "video" },
  { label: "Audio", value: "audio" },
  { label: "Documents", value: "application/pdf" },
  { label: "Text", value: "text" },
  { label: "Code", value: "application/json" },
];

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const hasActiveFilters =
    filters.type || filters.dateFrom || filters.dateTo || filters.minSize !== undefined;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          hasActiveFilters
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-100 hover:border-gray-600"
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Filters
        {hasActiveFilters && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-20 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-4 space-y-4">
          {/* File type */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              File Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => onChange({ ...filters, type: t.value || undefined })}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    (filters.type ?? "") === t.value
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
                className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
                className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => { onChange({}); setOpen(false); }}
            className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
