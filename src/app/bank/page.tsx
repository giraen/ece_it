"use client";

import { useState } from "react";
import Link from "next/link";
import TreePanel from "@/components/TreePanel";
import { useNodes, useQuestions } from "@/lib/hooks";
import { pathOf } from "@/lib/tree";

export default function BankPage() {
  const nodes = useNodes();
  const questions = useQuestions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!nodes || !questions) return <p className="text-sm text-muted">Loading…</p>;

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <TreePanel nodes={nodes} questions={questions} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{selected ? pathOf(nodes, selected.id) : "Bank"}</h1>
            <p className="mt-1 text-sm text-muted">Questions will appear here in a later step.</p>
          </div>
          <Link href={selected?.kind === "topic" ? `/editor?topic=${selected.id}` : "/editor"} className="btn btn-primary">
            New question
          </Link>
        </div>
      </section>
    </div>
  );
}