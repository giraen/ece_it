"use client";

import { useState } from "react";
import Link from "next/link";
import { countAvailable } from "@/lib/compose";
import type { TreeNode } from "@/lib/db";
import { formatCountdown, formatDate } from "@/lib/format";
import { useAttempts, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { treeMastery, type TreeMastery } from "@/lib/mastery";
import { childrenOf, KIND_LABEL } from "@/lib/tree";

const DAY = 86_400_000;

interface Ctx {
  nodes: TreeNode[];
  mastery: Map<string, TreeMastery>;
  counts: Map<string, number>;
  expanded: Set<string>;
  toggle: (at: string) => void;
  nowMs: number;
}

function Status({ m, nowMs }: { m: TreeMastery; nowMs: number }) {
  const { info } = m;
  if (info.status === "mastered" && info.expiresAt !== undefined) {
    const left = Math.max(1, Math.ceil((info.expiresAt - nowMs) / DAY));
    return (
      <span className="rounded bg-good/10 px-2 py-0.5 text-xs font-medium text-good">
        Mastered until {formatDate(info.expiresAt)} · {left} day{left === 1 ? "" : "s"} left
      </span>
    );
  }
  if (info.status === "expired" && info.expiresAt !== undefined) {
    return (
      <span className="rounded bg-line/60 px-2 py-0.5 text-xs font-medium text-muted">
        Expired {formatDate(info.expiresAt)}
      </span>
    );
  }
  return <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">Not yet</span>;
}

function Branch({ node, depth, at, ctx }: { node: TreeNode; depth: number; at: string; ctx: Ctx }) {
  const kids = childrenOf(ctx.nodes, node.id);
  const open = ctx.expanded.has(at);
  const m = ctx.mastery.get(node.id);
  const count = ctx.counts.get(node.id) ?? 0;
  if (!m) return null;
  const locked = m.info.lockedUntil !== undefined;
  const expired = m.info.status === "expired";

  let childText: string | null = null;
  if (m.childTotal > 0) {
    if (node.kind === "subject") childText = `topics mastered ${m.childMastered}/${m.childTotal}`;
    if (node.kind === "category") childText = `subjects mastered ${m.childMastered}/${m.childTotal}`;
  }

  return (
    <li>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2 pr-2 hover:bg-paper ${expired ? "opacity-75" : ""}`}
        style={{ paddingLeft: depth * 20 + 4 }}
      >
        {kids.length > 0 ? (
          <button
            className="w-5 text-xs text-muted"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={open}
            onClick={() => ctx.toggle(at)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className="min-w-0 flex-1 basis-40">
          <span className={`text-sm ${node.kind === "category" ? "font-semibold" : ""}`}>{node.name}</span>
          <span className="ml-2 text-xs text-muted">
            {KIND_LABEL[node.kind].toLowerCase()} · {count} question{count === 1 ? "" : "s"}
            {childText ? ` · ${childText}` : ""}
          </span>
        </span>
        {node.kind !== "category" && <Status m={m} nowMs={ctx.nowMs} />}
        {locked && m.info.lockedUntil !== undefined && (
          <span className="text-xs text-danger">Retake in {formatCountdown(m.info.lockedUntil - ctx.nowMs)}</span>
        )}
        <span className="flex gap-1.5">
          {node.kind === "category" ? (
            <span className="text-xs text-muted">Mock coming later</span>
          ) : locked || count === 0 ? (
            <span
              className="btn pointer-events-none py-1 opacity-40"
              aria-disabled="true"
              title={locked ? "Locked after a failed quiz" : "No questions yet"}
            >
              Quiz
            </span>
          ) : (
            <Link
              href={`/quiz/new?node=${node.id}`}
              className="btn btn-primary py-1"
              aria-label={`Quiz on ${node.name}`}
            >
              Quiz
            </Link>
          )}
        </span>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Branch key={k.id} node={k} depth={depth + 1} at={`${at}/${k.id}`} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Every category, subject, and topic with its mastery status, collapsed to categories at first. */
export default function MasteryOverview() {
  const nodes = useNodes();
  const attempts = useAttempts();
  const questions = useQuestions();
  const nowMs = useNow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!nodes || !attempts || !questions) return <p className="text-sm text-muted">Loading…</p>;

  const roots = childrenOf(nodes, null);
  const ctx: Ctx = {
    nodes,
    mastery: treeMastery(nodes, attempts, nowMs),
    counts: new Map(nodes.map((n) => [n.id, countAvailable(nodes, questions, n.id)])),
    expanded,
    nowMs,
    toggle: (at) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(at)) next.delete(at);
        else next.add(at);
        return next;
      }),
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mastery</h2>
        <p className="mt-1 text-sm text-muted">
          Pass a quiz at a level to earn mastery for that level. It lasts 14 days for a topic and 42 for a subject. A
          failed quiz locks that same item for 24 hours.
        </p>
      </div>
      {roots.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
          Nothing here yet.{" "}
          <Link href="/bank" className="underline">
            Add some questions
          </Link>{" "}
          first.
        </p>
      ) : (
        <ul className="rounded-md border border-line bg-surface p-2">
          {roots.map((r) => (
            <Branch key={r.id} node={r} depth={0} at={`/${r.id}`} ctx={ctx} />
          ))}
        </ul>
      )}
    </div>
  );
}