"use client";

import { useState } from "react";
import Link from "next/link";
import type { TreeNode } from "@/lib/db";
import { categoriesOf } from "@/lib/tree";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import TopicPicker from "./TopicPicker";

interface Props {
  defaultTopicId: string | null;
  nodes: TreeNode[];
}

/** "ELEX / MATH › EM Theory › Crosstalk". A shared subject lists every category it belongs to. */
function describe(nodes: TreeNode[], topicId: string): string {
  const topic = nodes.find((n) => n.id === topicId);
  const subject = topic?.parentId ? nodes.find((n) => n.id === topic.parentId) : undefined;
  if (!topic || !subject) return topic?.name ?? "";
  const cats = categoriesOf(subject)
    .map((id) => nodes.find((n) => n.id === id)?.name)
    .filter(Boolean)
    .join(" / ");
  return `${cats} › ${subject.name} › ${topic.name}`;
}

export default function QuestionEditor({ defaultTopicId, nodes }: Props) {
  const [topicId, setTopicId] = useState<string | null>(defaultTopicId);
  const [stem, setStem] = useState("");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">New question</h1>

        <TopicPicker nodes={nodes} value={topicId} onChange={setTopicId} />

        <p className="text-sm text-muted">
          {topicId ? (
            <>
              Filed under <strong className="text-ink">{describe(nodes, topicId)}</strong>
            </>
          ) : (
            "Choose a category, a subject, and a topic."
          )}
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium">Question</label>
          <ImageTextarea
            label="Question"
            value={stem}
            onChange={setStem}
            rows={6}
            placeholder="Write the question. Use $...$ for maths, and paste or drop a picture."
          />
          <p className="mt-1 text-xs text-muted">
            Maths goes between dollar signs, like $x^2$. For a centered formula, put $$ on its own line above and below it.
          </p>
        </div>

        <Link href="/bank" className="btn">
          Back to the bank
        </Link>
      </div>

      <aside aria-label="Preview">
        <div className="sticky top-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Preview</h2>
          <article className="rounded-md border border-line bg-surface p-5">
            {stem.trim() ? (
              <RichText text={stem} className="text-[15px] leading-relaxed" />
            ) : (
              <p className="text-sm text-muted">The question appears here as you type.</p>
            )}
          </article>
        </div>
      </aside>
    </div>
  );
}