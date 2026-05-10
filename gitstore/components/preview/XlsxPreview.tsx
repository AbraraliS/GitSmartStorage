"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, Loader2Icon, TableIcon } from "lucide-react";

interface XlsxPreviewProps {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  downloadUrl: string;
}

interface SheetData {
  name: string;
  rows: (string | number | boolean | null)[][];
  truncated: boolean;
}

const MAX_ROWS = 500;
const MAX_COLS = 50;

/**
 * XlsxPreview
 *
 * Renders XLSX/XLS spreadsheets using SheetJS (xlsx).
 * Reads via arrayBuffer() — never blob.text() (binary format).
 *
 * Features:
 *   - Sheet tabs for multi-sheet workbooks
 *   - Row/column table rendering
 *   - Truncation at 500 rows / 50 cols for performance
 *   - Lazy SheetJS import
 */
export function XlsxPreview({ arrayBuffer, fileName, downloadUrl }: XlsxPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const parse = async () => {
      try {
        const XLSX = await import("xlsx");
        const buffer = arrayBuffer.slice(0);
        const workbook = XLSX.read(buffer, { type: "array" });

        const parsed: SheetData[] = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          const raw: (string | number | boolean | null)[][] =
            XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (string | number | boolean | null)[][];

          const truncated = raw.length > MAX_ROWS || (raw[0]?.length ?? 0) > MAX_COLS;
          const rows = raw
            .slice(0, MAX_ROWS)
            .map((row) => (row as (string | number | boolean | null)[]).slice(0, MAX_COLS));

          return { name, rows, truncated };
        });

        if (alive) { setSheets(parsed); setActiveSheet(0); }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Spreadsheet parse failed");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void parse();
    return () => { alive = false; };
  }, [arrayBuffer]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-green-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-red-900/30 bg-gray-900 px-8 py-10 text-center">
        <p className="font-semibold text-red-400">Spreadsheet preview failed</p>
        <p className="text-xs text-gray-500">{error}</p>
        <a href={downloadUrl} download={fileName}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 transition">
          <DownloadIcon className="h-4 w-4" />
          Download
        </a>
      </div>
    );
  }

  const current = sheets[activeSheet];
  if (!current) return null;

  // Find the max column count across all rows (some rows may be shorter)
  const colCount = Math.max(0, ...current.rows.map((r) => r.length));
  const headers = current.rows[0] ?? [];
  const dataRows = current.rows.slice(1);

  return (
    <div className="flex w-[92vw] max-w-[1400px] flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-2 font-mono">
          <TableIcon className="h-3.5 w-3.5" />
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-green-950/40 px-2 py-0.5 text-green-300 uppercase">xlsx</span>
          <a href={downloadUrl} download={fileName}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition">
            <DownloadIcon className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-1">
          {sheets.map((s, i) => (
            <button key={s.name} type="button" onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded px-3 py-1.5 text-xs transition ${
                i === activeSheet
                  ? "bg-green-600 text-white"
                  : "text-gray-400 hover:bg-gray-800"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {current.truncated && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          ⚠️ Large sheet — showing first {MAX_ROWS} rows × {MAX_COLS} columns. Download for full data.
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-gray-800 shadow-xl" style={{ maxHeight: "72vh" }}>
        <table className="border-collapse text-xs text-gray-800">
          {/* Column headers (first row as header) */}
          {headers.length > 0 && (
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-gray-500 text-right min-w-[40px]">#</th>
                {headers.map((cell, ci) => (
                  <th key={ci} className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-left font-semibold whitespace-nowrap">
                    {String(cell ?? "")}
                  </th>
                ))}
                {/* Fill remaining columns */}
                {Array.from({ length: Math.max(0, colCount - headers.length) }).map((_, i) => (
                  <th key={`fill-${i}`} className="border border-gray-300 bg-gray-100 px-3 py-1.5" />
                ))}
              </tr>
            </thead>
          )}
          <tbody className="bg-white">
            {dataRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-200 px-2 py-1 text-gray-400 text-right text-[10px]">{ri + 2}</td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className="border border-gray-200 px-3 py-1 whitespace-nowrap max-w-[200px] truncate">
                    {String(row[ci] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {dataRows.length === 0 && (
              <tr>
                <td colSpan={colCount + 1} className="border border-gray-200 px-4 py-8 text-center text-gray-400">
                  Empty sheet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600">
        {current.rows.length} rows × {colCount} columns
        {current.truncated && " (truncated)"}
      </p>
    </div>
  );
}
