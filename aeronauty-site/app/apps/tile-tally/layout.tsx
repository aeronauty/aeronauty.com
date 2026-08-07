import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import TileTallyPwaRegistration from "./TileTallyPwaRegistration";

export const metadata: Metadata = {
  applicationName: "Game Ledger",
  manifest: "/tile-tally.webmanifest",
  icons: {
    icon: [{ url: "/tile-tally-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/tile-tally-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Game Ledger",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  themeColor: "#17243b",
  viewportFit: "cover",
  width: "device-width",
};

export default function TileTallyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TileTallyPwaRegistration />
      {children}
    </>
  );
}
