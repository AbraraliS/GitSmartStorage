import { WipeDataButton } from "@/components/settings/WipeDataButton";
import Link from "next/link";

export default function DangerZonePage() {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <Link 
          href="/settings" 
          className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-gray-200 mb-4 transition-colors"
        >
          &larr; Back to Settings
        </Link>
        <h1 className="text-xl font-bold text-red-500">Danger Zone</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Proceed with extreme caution. The actions here are destructive and permanent.
        </p>
      </div>

      <div className="rounded-xl border border-red-800/40 bg-red-950/10 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-red-400">Danger Zone</h2>
        <p className="mt-1 text-sm text-gray-400">
          These actions are permanent and cannot be undone.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between border-t border-red-800/20 pt-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-200">Delete all GitStore data</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-[400px]">
              Permanently deletes all repos, files, folders, and index data from GitHub.
              Your GitHub account itself is not affected.
            </p>
          </div>
          <div className="flex-shrink-0">
            <WipeDataButton />
          </div>
        </div>
      </div>
    </div>
  );
}
