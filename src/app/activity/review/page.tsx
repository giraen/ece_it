"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReviewRunner from "@/components/activity/ReviewRunner";
import LoadingScreen from "@/components/layout/LoadingScreen";

function Loader() {
  const params = useSearchParams();
  const deck = params.get("deck");
  // ?more=1 asks the daily review for another round after today's goal is met.
  const more = params.get("more") === "1";
  if (!deck) return <p className="text-sm">No deck chosen.</p>;
  return <ReviewRunner key={`${deck}:${more}`} deck={deck} more={more} />;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Loader />
    </Suspense>
  );
}
