"use client";

import { Suspense } from "react";
import SettingsPage from "@/components/SettingsPage";
import LoadingScreen from "@/components/LoadingScreen";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SettingsPage />
    </Suspense>
  );
}