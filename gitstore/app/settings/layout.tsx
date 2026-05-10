import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { IndexProvider } from "@/components/providers/IndexContext";
import { UploadProvider } from "@/components/providers/UploadContext";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";

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
        <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
          <SettingsSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto p-6 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </UploadProvider>
    </IndexProvider>
  );
}
