"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import QuestionList from "@/components/QuestionList";
import TreePanel from "@/components/TreePanel";
import { useNodes, useQuestions } from "@/lib/hooks";

function BankView() {
  const params = useSearchParams();
  const nodes = useNodes();
  const questions = useQuestions();
  // The address can name a node to open, such as /bank?node=<topic id>.
  const [selectedId, setSelectedId] = useState<string | null>(params.get("node"));

  if (!nodes || !questions) return <p className="text-sm text-muted">Loading…</p>;

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <TreePanel nodes={nodes} questions={questions} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <QuestionList key={selected?.id ?? "all"} nodes={nodes} questions={questions} selected={selected} />
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <BankView />
    </Suspense>
  );
}