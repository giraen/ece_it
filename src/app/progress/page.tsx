"use client";

import { Suspense } from "react";
import ProgressPage from "@/components/progress/ProgressPage";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProgressPage />
    </Suspense>
  );
}