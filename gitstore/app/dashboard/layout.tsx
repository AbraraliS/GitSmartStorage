import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BreadcrumbRow } from "@/components/layout/BreadcrumbRow";
import { FAB } from "@/components/layout/FAB";
import { IndexProvider } from "@/components/providers/IndexContext";
import { UploadProvider } from "@/components/providers/UploadContext";
import { SelectionProvider } from "@/components/providers/SelectionContext";
import { SidebarProvider } from "@/components/providers/SidebarContext";
import { UploadTray } from "@/components/upload/UploadTray";
import { DropZone } from "@/components/upload/DropZone";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <IndexProvider>
      <UploadProvider>
        <SelectionProvider>
          <SidebarProvider>
            {/*
             * Layout hierarchy:
             *   h-dvh (not h-screen): fixes Mobile Safari viewport clip
             *
             * Column structure:
             *   <Sidebar> — desktop persistent, mobile drawer
             *   <div flex-col>
             *     <Topbar>           — hamburger | search | avatar
             *     <BreadcrumbRow>    — location context (separate from topbar)
             *     <main>             — scrollable content
             *   </div>
             *
             * Floating:
             *   <FAB>       — mobile only (+), above bottom nav
             *   <UploadTray> — upload progress, bottom-right
             *   <DropZone>  — full-window drag-drop overlay
             */}
            <div className="flex h-dvh overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                <Topbar />
                {/* Desktop breadcrumb row (top) */}
                <div className="hidden md:block">
                  <BreadcrumbRow />
                </div>
                
                <main className="relative flex-1 overflow-y-auto overscroll-contain p-4 pb-20 md:p-6 md:pb-6">
                  {children}
                </main>
                
                {/* Mobile breadcrumb row (bottom) */}
                <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-[env(safe-area-inset-bottom,0px)]">
                  <BreadcrumbRow />
                </div>
              </div>
              <DropZone />
              <UploadTray />
              {/* FAB: mobile-only floating action button, lg:hidden inside */}
              <FAB />
            </div>
          </SidebarProvider>
        </SelectionProvider>
      </UploadProvider>
    </IndexProvider>
  );
}
