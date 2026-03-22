"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { l1Invalidate, l2InvalidateIndex } from "@/lib/cache";
import { Loader2 as Loader2Icon } from "lucide-react";

export function WipeDataButton() {
  const { data: session } = useSession();
  const [step, setStep] = useState<"idle" | "warning" | "typing" | "wiping" | "done" | "error">("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = session?.user?.name || (session as any)?.login || "";

  const handleWipe = async () => {
    if (typed !== login) return;
    setBusy(true);
    setStep("wiping");
    try {
      const res = await fetch("/api/admin/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationPhrase: typed,
          token: "dummy-csrf-token", 
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Wipe failed");
      }
      // Clear local caches before signing out
      await l2InvalidateIndex();
      l1Invalidate();
      setStep("done");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
      setBusy(false);
    }
  };

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("warning")}
        className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-800/50 text-red-500 font-medium text-sm rounded-lg transition-colors"
      >
        Delete all data
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setStep("warning")}
         className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-800/50 text-red-500 font-medium text-sm rounded-lg transition-colors"
      >
        Delete all data
      </button>

      {/* Modal Overlay */}
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
        {/* Modal Window */}
        <div className="bg-gray-900 border border-red-900/50 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
          
          {step === "warning" && (
            <>
              <div className="flex items-center gap-3 mb-4 text-red-500">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-xl font-bold">This will permanently delete everything</h2>
              </div>
              <ul className="list-disc pl-5 space-y-1 mb-6 text-sm text-gray-300">
                <li>All uploaded files (they cannot be recovered)</li>
                <li>All folders and folder structure</li>
                <li><code className="bg-gray-800 px-1 rounded text-red-400">gitstore-master</code>, <code className="bg-gray-800 px-1 rounded text-red-400">gitstore-secondary</code>, and all data repos</li>
                <li>Your entire index — all file metadata</li>
              </ul>
              <p className="text-sm font-medium text-emerald-400 mb-6 pb-4 border-b border-gray-800">
                Your GitHub account, profile, and other repositories are NOT affected.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep("idle")}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep("typing")}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  I understand, continue &rarr;
                </button>
              </div>
            </>
          )}

          {step === "typing" && (
            <>
              <h2 className="text-xl font-bold text-red-500 mb-4">Final Confirmation</h2>
              <p className="text-sm text-gray-400 mb-3">
                Type <span className="font-mono text-white px-1 bg-gray-800 rounded">{login}</span> to confirm:
              </p>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your GitHub username"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 focus:border-red-500 rounded-lg text-sm text-white placeholder-gray-600 outline-none mb-6"
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep("idle")}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={typed !== login || busy}
                  onClick={handleWipe}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center min-w-[200px]"
                >
                  {busy ? <Loader2Icon className="animate-spin w-5 h-5" /> : "Permanently delete everything"}
                </button>
              </div>
            </>
          )}

          {step === "error" && (
            <>
              <h2 className="text-xl font-bold text-red-500 mb-4">Wipe Failed</h2>
              <p className="text-sm text-gray-300 mb-6">{error}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setStep("idle");
                    setTyped("");
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Try again
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Wiping Overlay */}
      {step === "wiping" && (
        <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-gray-950">
          <Loader2Icon className="h-12 w-12 animate-spin text-red-500" />
          <p className="mt-4 text-gray-300 font-medium">Deleting all GitStore data...</p>
          <p className="mt-1 text-xs text-gray-500">This may take up to 30 seconds</p>
        </div>
      )}
    </>
  );
}
