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
  // ?now=1 takes the variants waiting for later now; ?card=<id> reviews just that card.
  const takeNow = params.get("now") === "1";
  const only = params.getAll("card");
  if (!deck) return <p className="text-sm">No deck chosen.</p>;
  return (
    <ReviewRunner
      key={`${deck}:${more}:${takeNow}:${only.join(",")}`}
      deck={deck}
      more={more}
      takeNow={takeNow}
      only={only.length ? only : undefined}
    />
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Loader />
    </Suspense>
  );
}
