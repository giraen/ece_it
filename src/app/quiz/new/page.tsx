"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NewMockForm from "@/components/NewMockForm";
import NewQuizForm from "@/components/NewQuizForm";
import { useAttempts, useBlueprint, useNodes, useNow, useQuestions } from "@/lib/hooks";

function Loader() {
  const id = useSearchParams().get("node");
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();
  const nowMs = useNow();
  const blueprint = useBlueprint(id);

  if (!nodes || !questions || !attempts || blueprint === undefined)
    return <p className="text-sm text-muted">Loading…</p>;
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
      <NewMockForm
        key={node.id}
        node={node}
        nodes={nodes}
        questions={questions}
        blueprint={blueprint}
        attempts={attempts}
        nowMs={nowMs}
      />
    );
  }
  return (
    <NewQuizForm key={node.id} node={node} nodes={nodes} questions={questions} attempts={attempts} nowMs={nowMs} />
  );
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}