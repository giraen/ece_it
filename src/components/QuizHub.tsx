"use client";

import Link from "next/link";
import { CONFIG } from "@/lib/config";
import { countAvailable } from "@/lib/compose";
import type { TreeNode } from "@/lib/db";
import { formatPercent } from "@/lib/format";
import { useAttempts, useNodes, useQuestions } from "@/lib/hooks";
import { abandonAttempt, isComplete } from "@/lib/quiz";
import { childrenOf } from "@/lib/tree";

function Row({ node, depth, nodes, counts }: { node: TreeNode; depth: number; nodes: TreeNode[]; counts: Map<string, number> }) {
  const count = counts.get(node.id) ?? 0;
  const kids = childrenOf(nodes, node.id);
  return (
    <li>
      <div className="flex items-center gap-3 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
        <span className="text-xs text-muted tabular-nums">{count} question{count === 1 ? "" : "s"}</span>
        {count > 0 ? (
          <Link href={`/quiz/new?node=${node.id}`} className="btn py-1" aria-label={`Quiz on ${node.name}`}>
            Quiz
          </Link>
        ) : (
          <span className="btn pointer-events-none py-1 opacity-40" aria-hidden>
            Quiz
          </span>
        )}
      </div>
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Row key={k.id} node={k} depth={depth + 1} nodes={nodes} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function QuizHub() {
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();

  if (!nodes || !questions || !attempts) return <p className="text-sm text-muted">Loading…</p>;

  const counts = new Map(nodes.map((n) => [n.id, countAvailable(nodes, questions, n.id)]));
  const inProgress = attempts.filter((a) => a.status === "in_progress").sort((a, b) => b.startedAt - a.startedAt);
  const recent = attempts
    .filter((a) => a.status === "submitted")
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
    .slice(0, 10);
  const roots = childrenOf(nodes, null);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Quizzes</h1>
        <p className="mt-1 text-sm text-muted">
          A topic or subject quiz is a standard quiz. A category quiz runs as a mock board, with no pause and no going
          back. You pass for mastery at {formatPercent(CONFIG.passBar, 0)} credit.
        </p>
      </div>

      {inProgress.length > 0 && (
        <section aria-label="In progress">
          <h2 className="mb-2 font-medium">In progress</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {inProgress.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.scopeName}</p>
                  <p className="text-xs text-muted">
                    {a.items.filter(isComplete).length} of {a.items.length} answered · started{" "}
                    {new Date(a.startedAt).toLocaleString()}
                  </p>
                </div>
                <Link href={`/quiz/play?id=${a.id}`} className="btn btn-primary">
                  Resume
                </Link>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (window.confirm("Discard this quiz?")) void abandonAttempt(a.id);
                  }}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Start a quiz">
        <h2 className="mb-2 font-medium">Start a quiz</h2>
        {roots.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
            Your bank is empty.{" "}
            <Link href="/bank" className="underline">
              Add a category and some questions
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="rounded-md border border-line bg-surface p-2">
            {roots.map((r) => (
              <Row key={r.id} node={r} depth={0} nodes={nodes} counts={counts} />
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent results">
          <h2 className="mb-2 font-medium">Recent results</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {recent.map((a) => (
              <li key={a.id}>
                <Link href={`/quiz/results?id=${a.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-paper">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.scopeName}</span>
                    <span className="text-xs text-muted">
                      {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : ""} · {a.items.length} questions
                    </span>
                  </span>
                  <span className={`text-sm font-medium tabular-nums ${a.summary?.passed ? "text-good" : "text-danger"}`}>
                    {a.summary ? formatPercent(a.summary.credit) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
