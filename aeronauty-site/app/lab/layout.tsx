import { Suspense } from "react";
import LabAccessTracker from "@/components/LabAccessTracker";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <LabAccessTracker />
      </Suspense>
      {children}
    </>
  );
}
