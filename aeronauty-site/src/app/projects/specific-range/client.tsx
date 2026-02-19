"use client";

import dynamic from "next/dynamic";

const SpecificRangeExplorer = dynamic(
  () => import("@/components/SpecificRangeExplorer"),
  {
    ssr: false,
    loading: () => (
      <div style={{
        minHeight: "100vh", background: "#0a0e17", color: "#e8e8e8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      }}>
        Loading...
      </div>
    ),
  }
);

export function SpecificRangeClient() {
  return <SpecificRangeExplorer />;
}
