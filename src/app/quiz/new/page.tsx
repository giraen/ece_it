"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NewQuizForm from "@/components/NewQuizForm";
import { countAvailable } from "@/lib/compose";
import { useNodes, useQuestions } from "@/lib/hooks";

function Loader() {
  const params = useSearchParams();
  const id = params.get("node");
  const nodes = useNodes();
  const questions = useQuestions();

  if (!nodes || !questions) return <p className="text-sm text-muted">Loading…</p>;
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    return (
      <p className="text-sm">
        That item no longer exists.{" "}
        <Link href="/quiz" className="underline">
          Back to quizzes
        </Link>
      </p>
    );
  }
  return <NewQuizForm key={node.id} node={node} nodes={nodes} available={countAvailable(nodes, questions, node.id)} />;
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}
