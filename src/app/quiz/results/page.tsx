"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ResultsView from "@/components/ResultsView";
import { useAttempt } from "@/lib/hooks";

function Loader() {
  const id = useSearchParams().get("id");
  const attempt = useAttempt(id);

  if (attempt === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (!attempt) {
    return (
      <p className="text-sm">
        That quiz no longer exists.{" "}
        <Link href="/quiz" className="underline">
          Back to quizzes
        </Link>
      </p>
    );
  }
  if (attempt.status !== "submitted") {
    return (
      <p className="text-sm">
        This quiz is not finished.{" "}
        <Link href={`/quiz/play?id=${attempt.id}`} className="underline">
          Resume it
        </Link>
      </p>
    );
  }
  return <ResultsView attempt={attempt} />;
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}
