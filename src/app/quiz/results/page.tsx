"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ResultsView from "@/components/ResultsView";

function Loader() {
  const id = useSearchParams().get("id");
  if (!id) return <p className="text-sm">No quiz selected.</p>;
  return <ResultsView key={id} attemptId={id} />;
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}