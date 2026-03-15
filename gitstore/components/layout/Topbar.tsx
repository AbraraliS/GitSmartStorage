"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";

interface TopbarProps {
  userName: string;
  userImage: string;
}

export function Topbar({ userName, userImage }: TopbarProps) {
  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur">
      <div className="text-sm text-gray-500">
        Backed by your private GitHub repositories
      </div>
      <div className="flex items-center gap-3">
        {userImage && (
          <Image
            src={userImage}
            alt={userName}
            width={28}
            height={28}
            className="rounded-full ring-1 ring-gray-700"
          />
        )}
        <span className="text-sm text-gray-300 hidden sm:block">{userName}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
