"use client";

/**
 * components/layout/MobileHeader.tsx
 *
 * A context-aware mobile page header with back navigation.
 * Renders only on mobile/tablet (< lg). Desktop uses the persistent Topbar.
 *
 * Usage:
 *   <MobileHeader title="Settings" backHref="/dashboard" />
 *   <MobileHeader title="Storage" backHref="/settings" actions={<DownloadButton />} />
 */

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

interface MobileHeaderProps {
  /** Page title shown in the center */
  title: string;
  /**
   * Where the back button navigates.
   * If omitted, router.back() is called with a fallback to /dashboard.
   */
  backHref?: string;
  /** Optional action elements rendered on the right side */
  actions?: React.ReactNode;
  /** Extra className for the outer element */
  className?: string;
}

export function MobileHeader({
  title,
  backHref,
  actions,
  className = "",
}: MobileHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      // Safe fallback: if there's meaningful history, go back.
      // Otherwise navigate to dashboard.
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/dashboard");
      }
    }
  };

  return (
    <header
      className={`flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 dark:border-gray-800 dark:bg-gray-900 lg:hidden ${className}`}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="touch-target shrink-0 rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Go back"
      >
        <ArrowLeftIcon className="h-5 w-5" />
      </button>

      {/* Title — centered between back button and actions */}
      <h1 className="flex-1 truncate text-center text-[15px] font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>

      {/* Right actions — must match width of back button to keep title centered */}
      <div className="flex shrink-0 items-center gap-1">
        {actions ?? <span className="w-11" aria-hidden />}
      </div>
    </header>
  );
}
