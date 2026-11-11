"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db, type MemoryCard, type Sureness, type TreeNode } from "@/lib/db";
import { useNodes, useNow } from "@/lib/hooks";
import { answerCard, startSession, useMemory, type AnswerResult, type Session } from "@/lib/memory/review";
import { reviewChoices, type ReviewChoice } from "@/lib/memory/choices";
import { KIND_LABEL } from "@/lib/memory/cards";
import { loadMix } from "@/lib/memory/mix";
import { REMEMBERING_BOX, TOP_BOX, stageOf, whenText, type CardState } from "@/lib/memory/schedule";
import { SURENESS_LABEL, SURENESS_ORDER } from "@/lib/quiz/scoring";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import { CloseIcon } from "@/components/ui/icons";
import RichText from "@/components/ui/RichText";
import LoadingScreen from "@/components/layout/LoadingScreen";

const LETTERS = "ABCD";

/** Six small bars, filled up to the card's box. */
function Boxes({ box, mark }: { box: number; mark?: number }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`Box ${box} of ${TOP_BOX}`}>
      {Array.from({ length: TOP_BOX }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-sm ${i < box ? "bg-accent" : "bg-track"} ${
            mark === i + 1 ? "outline-2 outline-offset-1 outline-ink" : ""
          }`}
        />
      ))}
    </div>
  );
}

function boxLabel(s: CardState | undefined) {
  const stage = stageOf(s);
  if (stage === "learned") return "Learned";
  if (stage === "new" || !s) return "New";
  return `Box ${s.box} of ${TOP_BOX}`;
}

/** What one answer did, in words. */
function Outcome({ r, nowMs }: { r: AnswerResult; nowMs: number }) {
  const { before, after } = r;
  const when = after.dueAt ? whenText(after.dueAt, nowMs) : "";
  const last = before.answers ? `Box ${before.box}` : "New";
  let title: string;
  let line: React.ReactNode;
  let tone = "text-good";
  if (!r.correct) {
    title = "Not this time";
    tone = "text-danger";
    line = (
      <>
        Back to <strong>box 1</strong>. It comes again <strong>{when}</strong>.
      </>
    );
  } else if (after.learned && !before.learned) {
    title = "Learned";
    line = (
      <>
        You remembered it at the 60-day review. It comes back every 90 days, next <strong>{when}</strong>.
      </>
    );
  } else if (after.learned) {
    title = "Still learned";
    line = (
      <>
        Next <strong>{when}</strong>.
      </>
    );
  } else if (r.sureness === "sure") {
    title = "Correct, and you were sure";
    line = (
      <>
        {last} → <strong>Box {after.box}</strong>
        {after.box === REMEMBERING_BOX && (
          <>
            , now <strong>Remembering</strong>
          </>
        )}
        . Back <strong>{when}</strong>.
      </>
    );
  } else {
    title = "Correct, but not sure";
    tone = "text-priority";
    line = (
      <>
        {before.box ? "Stays in" : "Starts in"} <strong>box {after.box}</strong>
        {before.box ? " and comes back sooner" : ""}: <strong>{when}</strong>.
      </>
    );
  }
  return (
    <div className="card space-y-2.5 p-4">
      <p className={`font-semibold ${tone}`}>{title}</p>
      <Boxes box={after.box} mark={r.correct && r.sureness === "sure" ? after.box : undefined} />
      <p className="text-sm">{line}</p>
    </div>
  );
}

interface Props {
  /** A category id, or "mixed" for the mixed deck. */
  deck: string;
}

/** A memory review: one card at a time, multiple choice, with how sure you are. */
export default function ReviewRunner({ deck }: Props) {
  const nodes = useNodes();
  const data = useMemory();
  const nowMs = useNow();
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<ReviewChoice[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [sureness, setSureness] = useState<Sureness | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0, opened: 0 });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const cardById = new Map((data?.cards ?? []).map((c) => [c.id, c]));
  // Starting opens the new cards each deck has earned, so it runs only once.
  const ready = !!data;
  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    void (async () => {
      const decks = deck === "mixed" ? (loadMix() ?? []) : [deck];
      if (!decks.length) {
        setProblem("Choose the categories for your mixed deck first.");
        return;
      }
      const s = await startSession(decks);
      const card = s.queue.length ? await db.cards.get(s.queue[0]) : undefined;
      if (card) setChoices(reviewChoices(card));
      setSession(s);
    })();
  }, [ready, deck]);

  const card: MemoryCard | undefined = session ? cardById.get(session.queue[index]) : undefined;
  const done = !!session && index >= session.queue.length;

  async function check() {
    if (!card || picked === null || !sureness || busy) return;
    setBusy(true);
    try {
      const choice = choices[picked];
      const r = await answerCard(card, choice.correct, sureness, choice.text);
      setResult(r);
      setScore((s) => ({
        right: s.right + (choice.correct ? 1 : 0),
        wrong: s.wrong + (choice.correct ? 0 : 1),
        opened: s.opened + r.opened.length,
      }));
      if (r.opened.length) {
        setSession((s) => (s ? { ...s, queue: [...s.queue, ...r.opened.map((c) => c.id)] } : s));
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!session) return;
    const i = index + 1;
    const nextCard = cardById.get(session.queue[i]);
    setIndex(i);
    setPicked(null);
    setSureness(null);
    setResult(null);
    if (nextCard) setChoices(reviewChoices(nextCard));
  }

  // 1 to 4 pick a choice; Enter checks, then goes on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!result && /^[1-4]$/.test(e.key) && Number(e.key) <= choices.length) setPicked(Number(e.key) - 1);
      else if (e.key === "Enter") {
        e.preventDefault();
        if (result) next();
        else void check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (problem) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-10 text-center">
        <p>{problem}</p>
        <Link href="/activity/mix" className="btn btn-primary">
          Choose a mix
        </Link>
      </div>
    );
  }
  if (!nodes || !data || !session) return <LoadingScreen />;

  const catOf = (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  const title = deck === "mixed" ? "Mixed deck" : (catOf(deck)?.name ?? "Memory");
  const total = session.queue.length;

  const header = (
    <header className="flex items-center gap-2 py-2">
      <Link
        href="/activity"
        aria-label="End review"
        className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-paper"
      >
        <CloseIcon />
      </Link>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex justify-between text-sm text-muted">
          <span>{title}</span>
          <span className="num">
            {Math.min(index + 1, total)} / {total}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
          <div
            className="h-full bg-accent"
            style={{ width: `${total ? (Math.min(index, total) / total) * 100 : 0}%` }}
          />
        </div>
      </div>
    </header>
  );

  if (done || total === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-lg flex-col gap-5 pb-6 lg:min-h-0">
        {header}
        <div className="card space-y-3 p-5">
          <h1 className="text-lg font-semibold">{total === 0 ? "Nothing to review" : "Review done"}</h1>
          {total === 0 ? (
            <p className="text-sm text-muted">Nothing in {title} is due today. Come back tomorrow.</p>
          ) : (
            <p className="text-sm">
              {total} card{total === 1 ? "" : "s"}: <span className="font-semibold text-good">{score.right} right</span>
              , <span className="font-semibold text-danger">{score.wrong} missed</span>.
              {score.opened > 0 &&
                ` Remembering ${score.opened === 1 ? "one card" : `${score.opened} cards`} opened ${score.opened === 1 ? "a new one" : "new ones"}.`}
            </p>
          )}
          {session.extra > 0 && (
            <p className="text-sm text-muted">
              {session.extra} extra new card{session.extra === 1 ? "" : "s"} came up today to keep pace with the exam.
            </p>
          )}
        </div>
        <Link href="/activity" className="btn btn-primary min-h-12">
          Back to Activity
        </Link>
      </div>
    );
  }

  if (!card) return <LoadingScreen />;
  const state = data.states.get(card.id);
  const cat = catOf(card.categoryId);
  const key = categoryKey(cat?.name);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-lg flex-col gap-4 pb-4 lg:min-h-0">
      {header}
      <div className="flex flex-wrap gap-1.5">
        {cat && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${key ? CATEGORY_STYLE[key].chip : ""}`}>
            {cat.name}
          </span>
        )}
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
          {KIND_LABEL[card.kind]}
        </span>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
          {boxLabel(result ? result.before : state)}
        </span>
      </div>

      <RichText text={card.prompt} className="text-xl leading-snug font-semibold" />

      <div role="radiogroup" aria-label="Choices" className="flex flex-col gap-2.5">
        {choices.map((c, i) => {
          const on = picked === i;
          let look = on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-paper";
          let note: string | null = null;
          if (result) {
            if (c.correct) {
              look = "border-good bg-good/10";
              note = on ? "Your answer" : "The answer";
            } else if (on) {
              look = "border-danger bg-danger/10";
              note = "Your answer";
            } else look = "border-line opacity-60";
          }
          return (
            <button
              key={i}
              role="radio"
              aria-checked={on}
              disabled={!!result}
              onClick={() => setPicked(i)}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-2 text-left text-base ${look}`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md text-xs ${
                  on && !result ? "bg-accent font-semibold text-white" : "border border-line text-muted"
                }`}
              >
                {LETTERS[i]}
              </span>
              <RichText text={c.text} className="min-w-0 flex-1" />
              {note && <span className="shrink-0 text-xs text-muted">{note}</span>}
            </button>
          );
        })}
      </div>

      {result ? (
        <>
          <Outcome r={result} nowMs={nowMs} />
          {result.opened.length > 0 && (
            <p role="status" className="rounded-lg bg-accent p-3 text-sm text-white">
              Now Remembering, so <strong>1 new card</strong> is unlocked. It joins this review at the end.
            </p>
          )}
          <button className="btn btn-primary mt-auto min-h-12" onClick={next}>
            {index + 1 < session.queue.length ? "Next card" : "Finish"}
          </button>
        </>
      ) : (
        <div className="mt-auto space-y-2.5">
          <p className="text-sm text-muted">How sure are you?</p>
          <div role="radiogroup" aria-label="How sure" className="grid grid-cols-2 gap-2">
            {SURENESS_ORDER.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={sureness === s}
                onClick={() => setSureness(s)}
                className={`min-h-11 rounded-md border-[1.5px] text-sm ${
                  sureness === s ? "border-accent bg-accent-soft font-semibold" : "border-line bg-surface"
                }`}
              >
                {SURENESS_LABEL[s]}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary min-h-12 w-full"
            disabled={picked === null || !sureness || busy}
            onClick={() => void check()}
          >
            {picked === null ? "Pick an answer" : !sureness ? "Say how sure you are" : "Check"}
          </button>
        </div>
      )}
    </div>
  );
}
