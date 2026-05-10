import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
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
             * h-dvh instead of h-screen:
             *   - Fixes Mobile Safari / Chrome Android viewport unit bug
             *   - Prevents layout clip when browser chrome is visible
             *   - Safe on desktop (dvh == vh when no browser chrome)
             */}
            <div className="flex h-dvh overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                <Topbar />
                <main className="relative flex-1 overflow-y-auto overscroll-contain p-4 mobile-bottom-inset md:p-6 md:pb-6">
                  {children}
                </main>
              </div>
              <DropZone />
              <UploadTray />
            </div>
          </SidebarProvider>
        </SelectionProvider>
      </UploadProvider>
    </IndexProvider>
  );
}
