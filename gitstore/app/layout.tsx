import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ActionStateProvider } from "@/components/providers/ActionStateContext";
import { ToastProvider } from "@/components/ui/toast/ToastContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GitStore — GitHub-backed File Storage",
  description:
    "Store, manage, search, and retrieve files of any format using your GitHub account as storage backend.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "GitStore",
    description: "Secure GitHub-backed file storage",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} bg-gray-950 text-gray-100 antialiased`}>
        <SessionProvider>
          <ActionStateProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ActionStateProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
