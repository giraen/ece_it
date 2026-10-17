"use client";

import { Suspense } from "react";
import ProgressPage from "@/components/ProgressPage";
import LoadingScreen from "@/components/LoadingScreen";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProgressPage />
    </Suspense>
  );
}