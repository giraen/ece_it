"use client";

import { useState } from "react";
import Link from "next/link";
import { CONFIG } from "@/lib/config";
import type { Question, TreeNode } from "@/lib/db";
import { childrenOf, subtreeOf } from "@/lib/tree";

interface Props {
  nodes: TreeNode[];
  questions: Question[];
}

/** How many questions sit under a node. A subject shared by two categories counts the same in both. */
function countUnder(nodes: TreeNode[], perTopic: Map<string, number>, id: string): number {
  return subtreeOf(nodes, id)
    .filter((n) => n.kind === "topic")
    .reduce((sum, n) => sum + (perTopic.get(n.id) ?? 0), 0);
}

function Row({
  node,
  depth,
  at,
  nodes,
  perTopic,
  open,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  at: string;
  nodes: TreeNode[];
  perTopic: Map<string, number>;
  open: Set<string>;
  toggle: (at: string) => void;
}) {
  const kids = childrenOf(nodes, node.id);
  const isOpen = open.has(at);
  const count = countUnder(nodes, perTopic, node.id);
  const minItems = node.kind === "category" ? undefined : CONFIG.quiz[node.kind].minItems;
  const practiceOnly = minItems !== undefined && count > 0 && count < minItems;

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-paper"
        style={{ paddingLeft: depth * 20 + 4 }}
      >
        {kids.length > 0 ? (
          <button
            className="w-5 text-xs text-muted"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => toggle(at)}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className={`min-w-0 flex-1 truncate text-sm ${node.kind === "category" ? "font-medium" : ""}`}>
          {node.name}
        </span>
        <span className="text-xs text-muted tabular-nums">
          {count} question{count === 1 ? "" : "s"}
        </span>
        {practiceOnly && (
          <span
            className="rounded bg-paper px-1.5 py-0.5 text-xs text-muted"
            title={`A quiz needs at least ${minItems} questions to award mastery`}
          >
            practice only
          </span>
        )}
        {node.kind === "category" ? (
          <span className="w-28 text-right text-xs text-muted">Mock coming later</span>
        ) : count === 0 ? (
          <span className="btn w-20 cursor-not-allowed opacity-50" aria-disabled="true">
            Quiz
          </span>
        ) : (
          <Link href={`/quiz/new?node=${node.id}`} className="btn w-20" aria-label={`Quiz on ${node.name}`}>
            Quiz
          </Link>
        )}
      </div>
      {isOpen && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Row
              key={k.id}
              node={k}
              depth={depth + 1}
              at={`${at}/${k.id}`}
              nodes={nodes}
              perTopic={perTopic}
              open={open}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The categories, subjects, and topics, each with a Quiz button. Collapsed to categories at first. */
export default function QuizPicker({ nodes, questions }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const perTopic = new Map<string, number>();
  for (const q of questions) perTopic.set(q.topicId, (perTopic.get(q.topicId) ?? 0) + 1);

  const toggle = (at: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(at)) next.delete(at);
      else next.add(at);
      return next;
    });

  const roots = childrenOf(nodes, null);
  if (roots.length === 0) return <p className="text-sm text-muted">Setting up the categories…</p>;

  return (
    <ul className="rounded-md border border-line bg-surface p-2">
      {roots.map((r) => (
        <Row
          key={r.id}
          node={r}
          depth={0}
          at={`/${r.id}`}
          nodes={nodes}
          perTopic={perTopic}
          open={open}
          toggle={toggle}
        />
      ))}
    </ul>
  );
}