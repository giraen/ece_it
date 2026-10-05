"use client";

import { useState } from "react";
import Link from "next/link";
import type { TreeNode } from "@/lib/db";
import { categoriesOf } from "@/lib/tree";
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

  return (
    <div className="max-w-3xl space-y-5">
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

      <Link href="/bank" className="btn">
        Back to the bank
      </Link>
    </div>
  );
}