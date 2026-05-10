"use client";

import { ShieldIcon, LockIcon, KeyIcon } from "lucide-react";
import { MobileHeader } from "@/components/layout/MobileHeader";

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <MobileHeader title="Security" backHref="/settings" />
      <div>
        <h1 className="text-xl font-bold text-gray-100">Security</h1>
        <p className="mt-1 text-sm text-gray-500">
          Client-side encryption, access control, and session management.
        </p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <LockIcon className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-100">Client-Side Encryption</h2>
            <p className="mt-1 text-xs text-gray-500">
              GitStore encrypts file data on your device using AES-256-GCM before uploading.
              Your encryption keys never leave your browser. GitHub only stores the encrypted blob.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30 px-3 py-2">
              <p className="text-xs text-emerald-400 font-medium">✓ End-to-end encrypted</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <KeyIcon className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-100">Access Tokens</h2>
            <p className="mt-1 text-xs text-gray-500">
              GitStore uses a GitHub OAuth token scoped to your account.
              This token is stored server-side in your session and never exposed to the client.
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Required scopes: <code className="text-emerald-400">repo</code>,{" "}
              <code className="text-emerald-400">read:user</code>
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldIcon className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-100">Data Isolation</h2>
            <p className="mt-1 text-xs text-gray-500">
              All data is stored in private GitHub repositories under your account.
              GitStore has no access to your data — it acts as a client-only orchestrator.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
