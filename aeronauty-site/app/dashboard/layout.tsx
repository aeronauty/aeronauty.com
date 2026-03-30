import { SessionProvider } from "next-auth/react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Aeronauty",
  description: "Personal dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dashboard",
  },
};

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-950 text-white selection:bg-blue-600/30">
        {children}
      </div>
    </SessionProvider>
  );
}
