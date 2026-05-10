import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { IndexProvider } from "@/components/providers/IndexContext";
import { UploadProvider } from "@/components/providers/UploadContext";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { SettingsMobileNav } from "@/components/settings/SettingsMobileNav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <IndexProvider>
      <UploadProvider>
        {/*
         * Settings layout — two-panel on desktop, stack-nav on mobile.
         *
         * Desktop: SettingsSidebar (left) + scrollable content (right)
         * Mobile:  SettingsMobileNav shows top-level list; each settings page
         *          renders its own MobileHeader with a back button.
         */}
        <div className="flex h-dvh overflow-hidden bg-gray-950 text-gray-100">

          {/* Desktop sidebar — hidden on mobile */}
          <SettingsSidebar />

          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            {/* Mobile: top-level nav list (hidden when on a sub-page via CSS) */}
            <SettingsMobileNav />

            {/* Page content */}
            <main className="flex-1 overflow-y-auto overscroll-contain p-4 pb-6 md:p-6 md:pb-8 lg:p-8">
              {children}
            </main>
          </div>
        </div>
      </UploadProvider>
    </IndexProvider>
  );
}
