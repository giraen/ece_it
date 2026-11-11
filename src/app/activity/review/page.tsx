"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReviewRunner from "@/components/activity/ReviewRunner";
import LoadingScreen from "@/components/layout/LoadingScreen";

function Loader() {
  const deck = useSearchParams().get("deck");
  if (!deck) return <p className="text-sm">No deck chosen.</p>;
  return <ReviewRunner key={deck} deck={deck} />;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Loader />
    </Suspense>
  );
}
