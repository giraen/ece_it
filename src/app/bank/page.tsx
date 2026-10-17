"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConceptList from "@/components/ConceptList";
import LoadingScreen from "@/components/LoadingScreen";
import QuestionList from "@/components/QuestionList";
import TreePanel from "@/components/TreePanel";
import { useDrafts } from "@/lib/concepts";
import { useConcepts, useNodes, useQuestions } from "@/lib/hooks";

type Tab = "questions" | "concepts";

function BankView() {
  const router = useRouter();
  const params = useSearchParams();
  const nodes = useNodes();
  const questions = useQuestions();
  const concepts = useConcepts();
  const drafts = useDrafts();
  // The address holds the node, the tab, and the page, such as /bank?node=<id>&tab=concepts&page=3, so a refresh keeps your place.
  const selectedId = params.get("node");
  const tab: Tab = params.get("tab") === "concepts" ? "concepts" : "questions";

  if (!nodes || !questions || !concepts || !drafts) return <LoadingScreen />;

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const open = (nodeId: string | null, t: Tab) => {
    const q = new URLSearchParams();
    if (nodeId) q.set("node", nodeId);
    if (t === "concepts") q.set("tab", "concepts");
    const text = q.toString();
    router.replace(`/bank${text ? `?${text}` : ""}`, { scroll: false });
  };
  const go = (t: Tab) => open(selected?.id ?? null, t);
  const select = (id: string | null) => open(id, tab);
  const tabs: { id: Tab; label: string }[] = [
    { id: "questions", label: `Questions (${questions.length})` },
    { id: "concepts", label: `Concepts (${concepts.length})` },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Bank sections" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => go(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <TreePanel nodes={nodes} questions={questions} selectedId={selected?.id ?? null} onSelect={select} />
        {tab === "questions" ? (
          <QuestionList key={selected?.id ?? "all"} nodes={nodes} questions={questions} selected={selected} />
        ) : (
          <ConceptList
            key={selected?.id ?? "all"}
            nodes={nodes}
            concepts={concepts}
            drafts={drafts}
            selected={selected}
          />
        )}
      </div>
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BankView />
    </Suspense>
  );
}