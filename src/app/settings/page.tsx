"use client";

import { Suspense } from "react";
import SettingsPage from "@/components/settings/SettingsPage";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SettingsPage />
    </Suspense>
  );
}