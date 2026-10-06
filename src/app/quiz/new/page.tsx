"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NewQuizForm from "@/components/NewQuizForm";
import { useNodes, useQuestions } from "@/lib/hooks";

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
  if (node.kind === "category") {
    return (
      <p className="text-sm">
        A whole category is quizzed as a mock board, which comes in a later step. Choose a subject or a topic for now.{" "}
        <Link href="/quiz" className="underline">
          Back
        </Link>
      </p>
    );
  }
  return <NewQuizForm key={node.id} node={node} nodes={nodes} questions={questions} />;
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}