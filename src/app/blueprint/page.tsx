"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BlueprintEditor from "@/components/BlueprintEditor";
import { useBlueprint, useNodes, useQuestions } from "@/lib/hooks";

function Loader() {
  const id = useSearchParams().get("category");
  const nodes = useNodes();
  const questions = useQuestions();
  const blueprint = useBlueprint(id);

  if (!nodes || !questions || blueprint === undefined) return <p className="text-sm text-muted">Loading…</p>;
  const category = nodes.find((n) => n.id === id && n.kind === "category");
  if (!category) {
    return (
      <p className="text-sm">
        That category no longer exists.{" "}
        <Link href="/quiz" className="underline">
          Back to the quiz page
        </Link>
      </p>
    );
  }
  return (
    <BlueprintEditor key={category.id} category={category} nodes={nodes} questions={questions} initial={blueprint} />
  );
}

export default function BlueprintPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}