"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MemoryCard, Question, TreeNode } from "@/lib/db";
import { useAttempts, useNodes, useQuestions } from "@/lib/hooks";
import { categoriesOf, pathOf } from "@/lib/bank/tree";
import { deleteQuestions } from "@/lib/bank/questions";
import { restoreQuestions, snapshotQuestions } from "@/lib/bank/bulk";
import { findPairs, pairKey, plainText, setDifferent, useDifferent, wordDiff, type Pair } from "@/lib/bank/duplicates";
import { KIND_LABEL, cardDecks, deleteCards, restoreCards, snapshotCards, useCards } from "@/lib/memory/cards";
import { formatDate } from "@/lib/format";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import RichText from "@/components/ui/RichText";
import Reference from "@/components/editor/Reference";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { useUndoToast } from "@/components/memory/CardBar";

const MINIMUMS = [50, 60, 70, 80, 90];
const pct = (n: number) => `${Math.floor(n * 100)}%`;

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`;

/** A question's text with the words the other one lacks marked, when it is plain enough to mark word by word. */
function Marked({ text, other, className }: { text: string; other: string; className?: string }) {
  if (!plainText(text) || !plainText(other)) return <RichText text={text} className={className} />;
  const parts = wordDiff(text, other).a;
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.changed ? (
          <mark key={i} className="rounded-sm bg-priority-soft px-0.5 text-priority">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {[...tags]
        .sort((a, b) => a.localeCompare(b))
        .map((t) => (
          <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
            {t}
          </span>
        ))}
    </div>
  );
}

function PairHead({
  pair,
  agree,
  where,
  different,
  onDifferent,
}: {
  pair: Pair;
  agree: boolean;
  where: { name: string; path: string } | null;
  different: boolean;
  onDifferent: () => void;
}) {
  const key = categoryKey(where?.name);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {pair.same ? (
        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger">Same wording</span>
      ) : (
        <span className="num rounded bg-priority-soft px-1.5 py-0.5 text-xs font-medium text-priority">
          {pct(pair.score)} alike
        </span>
      )}
      {agree ? (
        <span className="text-xs text-muted">Same answer</span>
      ) : (
        <span className="text-xs font-medium text-danger">Different answers: check before deleting</span>
      )}
      {where && (
        <span className="flex items-center gap-1 text-xs text-muted">
          {key && <span aria-hidden="true" className={`size-2 rounded-sm ${CATEGORY_STYLE[key].bar}`} />}
          {where.path}
        </span>
      )}
      <button className="btn ml-auto py-1" onClick={onDifferent}>
        {different ? "Show as a possible duplicate again" : "These are different"}
      </button>
    </div>
  );
}

/**
 * Settings › Possible duplicates: questions, or memory cards, that look like the same item added twice, compared
 * within each category (deck). Each pair shows how alike the wording is.
 */
export default function Duplicates() {
  const nodes = useNodes();
  const questions = useQuestions();
  const cards = useCards();
  const attempts = useAttempts();
  const different = useDifferent();
  const [tab, setTab] = useState<"questions" | "cards">("questions");
  const [min, setMin] = useState(70);
  const [kind, setKind] = useState<"all" | "same" | "similar">("all");
  const [cat, setCat] = useState("");
  const [showDifferent, setShowDifferent] = useState(false);
  const { toast, say, dismiss } = useUndoToast();

  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes]);

  // The categories a question's topic is in: through its subject, which may be shared by more than one.
  const catsOfTopic = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const n of nodes ?? []) {
      if (n.kind !== "topic") continue;
      const subject = n.parentId ? byId.get(n.parentId) : undefined;
      out.set(n.id, subject ? categoriesOf(subject) : []);
    }
    return out;
  }, [nodes, byId]);

  const questionPairs = useMemo(
    () =>
      questions
        ? findPairs(
            questions.map((q) => ({ id: q.id, text: q.stem, groups: catsOfTopic.get(q.topicId) ?? [] })),
            MINIMUMS[0] / 100,
          )
        : [],
    [questions, catsOfTopic],
  );
  const cardPairs = useMemo(
    () =>
      cards
        ? findPairs(
            cards.map((c) => ({ id: c.id, text: c.prompt, groups: cardDecks(c) })),
            MINIMUMS[0] / 100,
          )
        : [],
    [cards],
  );

  // How many finished quizzes each question has been in.
  const inQuizzes = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attempts ?? []) {
      if (a.status !== "submitted") continue;
      for (const id of new Set(a.items.map((i) => i.questionId))) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [attempts]);

  if (!nodes || !questions || !cards || !different) return <LoadingScreen />;

  const qById = new Map(questions.map((q) => [q.id, q]));
  const cById = new Map(cards.map((c) => [c.id, c]));
  const categories = nodes.filter((n) => n.kind === "category" && !n.deletedAt).sort((a, b) => a.order - b.order);
  const groupsOf = (id: string) =>
    tab === "questions" ? (catsOfTopic.get(qById.get(id)?.topicId ?? "") ?? []) : cardDecks(cById.get(id)!);

  const all = (tab === "questions" ? questionPairs : cardPairs).filter((p) =>
    tab === "questions" ? qById.has(p.a) && qById.has(p.b) : cById.has(p.a) && cById.has(p.b),
  );
  const inView = all
    .filter((p) => p.score >= min / 100)
    .filter((p) => !cat || (groupsOf(p.a).includes(cat) && groupsOf(p.b).includes(cat)));
  const marked = inView.filter((p) => different.has(pairKey(p.a, p.b)));
  const open = inView.filter((p) => !different.has(pairKey(p.a, p.b)));
  const listed = (showDifferent ? inView : open).filter((p) =>
    kind === "same" ? p.same : kind === "similar" ? !p.same : true,
  );
  const count = (k: typeof kind) =>
    open.filter((p) => (k === "same" ? p.same : k === "similar" ? !p.same : true)).length;
  const tabCount = (list: Pair[]) =>
    list.filter((p) => p.score >= min / 100 && !different.has(pairKey(p.a, p.b))).length;

  async function removeQuestion(q: Question) {
    const before = await snapshotQuestions([q.id]);
    await deleteQuestions([q.id]);
    say("Question deleted", () => restoreQuestions(before));
  }
  async function removeCard(c: MemoryCard) {
    const before = await snapshotCards([c.id]);
    await deleteCards([c.id]);
    say("Card deleted", () => restoreCards(before));
  }
  async function toggleDifferent(p: Pair) {
    const key = pairKey(p.a, p.b);
    const was = different!.has(key);
    await setDifferent(key, !was);
    if (!was) say("Marked as different", () => setDifferent(key, false));
  }

  /** Where a pair is: the path the two share, or the category when their topics differ. */
  function whereQ(a: Question, b: Question) {
    const pa = pathOf(nodes!, a.topicId);
    const pb = pathOf(nodes!, b.topicId);
    const name = pa.split(" › ")[0];
    return { name, path: pa === pb ? pa : `${pa}  ·  ${pb}` };
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Checked {questions.length.toLocaleString()} question{questions.length === 1 ? "" : "s"} and{" "}
        {cards.length.toLocaleString()} memory card{cards.length === 1 ? "" : "s"}, each against the others in its
        category. Nothing is deleted unless you choose to.
      </p>

      <nav aria-label="What to check" className="inline-flex overflow-hidden rounded-md border border-line">
        {(
          [
            ["questions", "Questions", tabCount(questionPairs)],
            ["cards", "Memory cards", tabCount(cardPairs)],
          ] as const
        ).map(([id, label, n], i) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
              tab === id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
            }`}
          >
            {label} <span className="num">{n}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["same", "Same wording"],
            ["similar", "Similar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            className={chip(kind === id)}
            onClick={() => setKind(id)}
          >
            {label} {count(id)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          At least
          <select
            className="input w-auto py-1.5 text-sm"
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            aria-label="Show pairs at least this alike"
          >
            {MINIMUMS.map((m) => (
              <option key={m} value={m}>
                {m}% alike
              </option>
            ))}
          </select>
        </label>
        <select
          className="input w-auto py-1.5 text-sm"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          aria-label="Category"
        >
          <option value="">Every category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {marked.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={showDifferent} onChange={(e) => setShowDifferent(e.target.checked)} />
            Show pairs marked different ({marked.length})
          </label>
        )}
      </div>

      {listed.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          {open.length === 0
            ? `No ${tab === "questions" ? "questions" : "memory cards"} look ${min}% alike or more. Lower the percentage to look for looser matches.`
            : "None of this kind."}
        </p>
      ) : (
        <ul className="space-y-4">
          {listed.map((p) => {
            const isDifferent = different.has(pairKey(p.a, p.b));
            if (tab === "questions") {
              const [x, y] = [qById.get(p.a)!, qById.get(p.b)!].sort((m, n) => m.createdAt - n.createdAt);
              const answer = (q: Question) => q.choices.find((c) => c.id === q.correctChoiceId)?.text ?? "";
              const agree = answer(x).trim().toLowerCase() === answer(y).trim().toLowerCase();
              return (
                <li key={pairKey(p.a, p.b)} className={`card space-y-3 p-4 ${isDifferent ? "opacity-60" : ""}`}>
                  <PairHead
                    pair={p}
                    agree={agree}
                    where={whereQ(x, y)}
                    different={isDifferent}
                    onDifferent={() => void toggleDifferent(p)}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    {[x, y].map((q, i) => (
                      <QuestionSide
                        key={q.id}
                        q={q}
                        other={i === 0 ? y : x}
                        label={i === 0 ? "Older" : "Newer"}
                        quizzes={inQuizzes.get(q.id) ?? 0}
                        nodes={nodes}
                        showPath={x.topicId !== y.topicId}
                        onDelete={() => void removeQuestion(q)}
                      />
                    ))}
                  </div>
                </li>
              );
            }
            const [x, y] = [cById.get(p.a)!, cById.get(p.b)!].sort((m, n) => m.createdAt - n.createdAt);
            const agree = x.answer.trim().toLowerCase() === y.answer.trim().toLowerCase();
            const deck = byId.get(x.categoryId);
            return (
              <li key={pairKey(p.a, p.b)} className={`card space-y-3 p-4 ${isDifferent ? "opacity-60" : ""}`}>
                <PairHead
                  pair={p}
                  agree={agree}
                  where={deck ? { name: deck.name, path: deck.name } : null}
                  different={isDifferent}
                  onDifferent={() => void toggleDifferent(p)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {[x, y].map((c, i) => (
                    <CardSide
                      key={c.id}
                      c={c}
                      other={i === 0 ? y : x}
                      label={i === 0 ? "Older" : "Newer"}
                      onDelete={() => void removeCard(c)}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink py-2 pr-2 pl-4 text-sm whitespace-nowrap text-paper shadow-lg lg:bottom-6"
        >
          <span>{toast.message}</span>
          <button
            className="rounded px-2 py-0.5 font-semibold underline underline-offset-2 hover:bg-paper/15"
            onClick={async () => {
              const undo = toast.undo;
              dismiss();
              await undo();
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionSide({
  q,
  other,
  label,
  quizzes,
  nodes,
  showPath,
  onDelete,
}: {
  q: Question;
  other: Question;
  label: string;
  quizzes: number;
  nodes: TreeNode[];
  showPath: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded bg-paper px-1.5 py-0.5 font-medium">{label}</span>
        <span className="text-muted">
          Added {formatDate(q.createdAt)} · in {quizzes} quiz{quizzes === 1 ? "" : "zes"}
        </span>
      </div>
      {showPath && <p className="text-xs text-muted">{pathOf(nodes, q.topicId)}</p>}
      <Reference text={q.reference || "No source"} />
      <Marked text={q.stem} other={other.stem} className="text-[15px] leading-relaxed" />
      <ul className="space-y-1">
        {q.choices.map((c, i) => {
          const right = c.id === q.correctChoiceId;
          return (
            <li
              key={c.id}
              className={`flex items-start gap-2 rounded border px-2 py-1 text-sm ${
                right ? "border-good bg-good/5" : "border-line"
              }`}
            >
              <span className="font-mono text-xs text-muted">{"ABCDEFGH"[i]}</span>
              <RichText text={c.text} className="min-w-0 flex-1" />
              {right && <span className="text-xs text-good">Answer</span>}
            </li>
          );
        })}
      </ul>
      <Tags tags={q.tags} />
      <div className="flex gap-2 pt-1">
        <Link href={`/editor?id=${q.id}`} className="btn py-1">
          Edit
        </Link>
        <button className="btn btn-danger py-1" onClick={onDelete}>
          Delete this one
        </button>
      </div>
    </div>
  );
}

function CardSide({
  c,
  other,
  label,
  onDelete,
}: {
  c: MemoryCard;
  other: MemoryCard;
  label: string;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded bg-paper px-1.5 py-0.5 font-medium">{label}</span>
        <span className="text-muted">
          Added {formatDate(c.createdAt)} · {KIND_LABEL[c.kind]}
        </span>
      </div>
      <Marked text={c.prompt} other={other.prompt} className="text-[15px] leading-relaxed font-medium" />
      <div className="rounded border border-good bg-good/5 px-2 py-1 text-sm">
        <RichText text={c.answer} />
      </div>
      <Tags tags={c.tags ?? []} />
      <div className="flex gap-2 pt-1">
        <Link href={`/editor?card=${c.id}`} className="btn py-1">
          Edit
        </Link>
        <button className="btn btn-danger py-1" onClick={onDelete}>
          Delete this one
        </button>
      </div>
    </div>
  );
}
