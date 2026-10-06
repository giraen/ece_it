"use client";

import { Suspense } from "react";
import ProgressPage from "@/components/ProgressPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ProgressPage />
    </Suspense>
  );
}