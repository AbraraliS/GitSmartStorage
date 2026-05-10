"use client";

import { signIn } from "next-auth/react";
import { GithubIcon } from "lucide-react";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <GithubIcon className="h-4 w-4" />
      Continue with GitHub
    </button>
  );
}
