import { WipeDataButton } from "@/components/settings/WipeDataButton";
import Link from "next/link";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";

export default function DangerZonePage() {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Settings
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="rounded-lg bg-red-950/30 p-2.5">
            <AlertTriangleIcon className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-red-400">Danger Zone</h1>
            <p className="text-sm text-gray-500">
              Proceed with extreme caution. These actions are permanent and cannot be undone.
            </p>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl border border-red-800/40 bg-red-950/10 px-4 py-3">
        <p className="text-sm text-red-300">
          ⚠️ All actions below are <strong>irreversible</strong>. Your files will be permanently
          deleted from GitHub and cannot be recovered.
        </p>
      </div>

      {/* Delete all data */}
      <div className="rounded-xl border border-red-800/40 bg-red-950/10 p-6">
        <h2 className="text-base font-semibold text-red-400">Delete All GitStore Data</h2>
        <p className="mt-1 text-sm text-gray-400">
          Permanently deletes all repos, files, folders, and index data from GitHub.
          Your GitHub account itself is not affected — only GitStore-managed repos are removed.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between border-t border-red-800/20 pt-4 gap-4">
          <div className="text-xs text-gray-500 space-y-1">
            <p>This will delete:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>All data node repositories</li>
              <li>The master index repository</li>
              <li>All file blobs and chunks</li>
              <li>All metadata and search indexes</li>
            </ul>
          </div>
          <div className="flex-shrink-0">
            <WipeDataButton />
          </div>
        </div>
      </div>
    </div>
  );
}
