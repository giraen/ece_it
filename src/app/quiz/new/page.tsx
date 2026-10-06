"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useNodes, useQuestions } from "@/lib/hooks";
import { pathOf, subtreeOf } from "@/lib/tree";

function Loader() {
  const id = useSearchParams().get("node");
  const nodes = useNodes();
  const questions = useQuestions();

  if (!nodes || !questions) return <p className="text-sm text-muted">Loading…</p>;
  const node = id ? nodes.find((n) => n.id === id) : undefined;
  if (!node) {
    return (
      <p className="text-sm">
        That topic or subject no longer exists.{" "}
        <Link href="/quiz" className="underline">
          Back to the quiz page
        </Link>
      </p>
    );
  }
  const topics = new Set(
    subtreeOf(nodes, node.id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const count = questions.filter((q) => topics.has(q.topicId)).length;

  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-xl font-semibold">New quiz</h1>
      <p className="font-medium">{pathOf(nodes, node.id)}</p>
      <p className="text-sm text-muted">
        {count} question{count === 1 ? "" : "s"} available. Choosing the size and starting the quiz comes next.
      </p>
      <Link href="/quiz" className="btn">
        Back
      </Link>
    </div>
  );
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}