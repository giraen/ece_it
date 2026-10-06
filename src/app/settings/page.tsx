"use client";

import { Suspense } from "react";
import SettingsPage from "@/components/SettingsPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SettingsPage />
    </Suspense>
  );
}