import type { Metadata } from "next";
import "./globals.css";
import Analytics from "@/components/Analytics";

export const metadata: Metadata = {
  title: "Aeronauty - Where an aero nerd shares things he finds interesting",
  description: "A collection of code snippets, projects, and things in and around the work I do in aerospace engineering (and other things!)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Analytics />
        {children}
      </body>
    </html>
  );
}


