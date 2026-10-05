"use client";

import { useState } from "react";
import ImageTextarea from "@/components/ImageTextarea";
import RichText from "@/components/RichText";
import TreePanel from "@/components/TreePanel";
import { useNodes, useQuestions } from "@/lib/hooks";
import { pathOf } from "@/lib/tree";

export default function BankPage() {
  const nodes = useNodes();
  const questions = useQuestions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("The gain is $A_v = -g_m R_D$. Paste a picture here.");

  if (!nodes || !questions) return <p className="text-sm text-muted">Loading…</p>;

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <TreePanel nodes={nodes} questions={questions} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <section className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{selected ? pathOf(nodes, selected.id) : "Bank"}</h1>
          <p className="mt-1 text-sm text-muted">Questions will appear here in a later step.</p>
        </div>

        {/* Temporary playground for this step. The question editor replaces it next. */}
        <div className="space-y-3 rounded-md border border-dashed border-line p-4">
          <h2 className="text-sm font-medium">Try it: maths and pictures</h2>
          <ImageTextarea label="Try it" value={text} onChange={setText} rows={4} />
          <div className="rounded-md border border-line bg-surface p-4">
            <RichText text={text} className="text-[15px] leading-relaxed" />
          </div>
        </div>
      </section>
    </div>
  );
}