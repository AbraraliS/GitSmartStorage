import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { IndexProvider } from "@/components/providers/IndexContext";
import { UploadProvider } from "@/components/providers/UploadContext";
import { SelectionProvider } from "@/components/providers/SelectionContext";
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
          <div className="flex h-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar />
              <main className="relative flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
            </div>
            <DropZone />
            <UploadTray />
          </div>
        </SelectionProvider>
      </UploadProvider>
    </IndexProvider>
  );
}
