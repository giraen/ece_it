"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";
import LoadingScreen from "@/components/LoadingScreen";

function Loader() {
  const id = useSearchParams().get("id");
  if (!id) return <p className="text-sm">No quiz selected.</p>;
  return <QuizRunner key={id} attemptId={id} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Loader />
    </Suspense>
  );
}