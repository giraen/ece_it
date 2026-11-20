"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db, type MemoryCard, type Sureness, type TreeNode } from "@/lib/db";
import { useNodes, useNow } from "@/lib/hooks";
import { answerCard, startDaily, startSession, useMemory, type AnswerResult, type Session } from "@/lib/memory/review";
import { loadDailySize } from "@/lib/memory/daily";
import { reviewChoices, type ReviewChoice } from "@/lib/memory/choices";
import { KIND_LABEL } from "@/lib/memory/cards";
import { loadMix } from "@/lib/memory/mix";
import { REMEMBERING_BOX, TOP_BOX, stageOf, whenText, type CardState } from "@/lib/memory/schedule";
import { SURENESS_LABEL, SURENESS_ORDER } from "@/lib/quiz/scoring";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import { CloseIcon } from "@/components/ui/icons";
import RichText from "@/components/ui/RichText";
import { loadIncognito } from "@/lib/incognito";
import { IncognitoTag } from "@/components/ui/Incognito";
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
  if (stage === "locked") return "Locked";
  if (stage === "new" || !s) return "New";
  return `Box ${s.box} of ${TOP_BOX}`;
}

/** What one answer did, in words: a short title, its colour, a line, and the box the card is in now. */
function outcome(r: AnswerResult, nowMs: number): { title: string; tone: string; line: React.ReactNode; box: number } {
  const { before, after } = r;
  if (r.recorded && r.daily) {
    if (r.correct)
      return {
        title: "Correct",
        tone: "text-good",
        box: before.box,
        line: before.unlocked ? (
          <>
            Daily practice, so it stays{" "}
            <strong>{before.learned ? "learned" : before.box ? `in box ${before.box}` : "new"}</strong>. Only deck
            reviews move cards up.
          </>
        ) : (
          <>Not unlocked yet. It opens as you remember other cards in its deck.</>
        ),
      };
    if (!before.unlocked)
      return {
        title: "Not this time",
        tone: "text-danger",
        box: 0,
        line: <>Not unlocked yet, so it has no box to drop. The miss is noted for when it opens.</>,
      };
    return {
      title: "Not this time",
      tone: "text-danger",
      box: 1,
      line: (
        <>
          Back to <strong>box 1</strong>, and due now: it comes up in its deck&apos;s review today.
        </>
      ),
    };
  }
  if (!r.recorded) {
    return {
      title: r.correct ? "Correct" : "Not this time",
      tone: r.correct ? "text-good" : "text-danger",
      box: before.box,
      line: (
        <>
          Incognito, so nothing changes: it stays{" "}
          <strong>{before.learned ? "learned" : before.box ? `in box ${before.box}` : "new"}</strong>.
        </>
      ),
    };
  }
  const when = after.dueAt ? whenText(after.dueAt, nowMs) : "";
  const last = before.answers ? `Box ${before.box}` : "New";
  if (!r.correct) {
    return {
      title: "Not this time",
      tone: "text-danger",
      box: after.box,
      line: (
        <>
          Back to <strong>box 1</strong>. It comes again <strong>{when}</strong>.
        </>
      ),
    };
  }
  if (after.learned && !before.learned) {
    return {
      title: "Learned",
      tone: "text-good",
      box: after.box,
      line: (
        <>
          Remembered at the 60-day review. It comes back every 90 days, next <strong>{when}</strong>.
        </>
      ),
    };
  }
  if (after.learned) {
    return {
      title: "Still learned",
      tone: "text-good",
      box: after.box,
      line: (
        <>
          Next <strong>{when}</strong>.
        </>
      ),
    };
  }
  if (r.sureness === "sure") {
    return {
      title: "Correct, and you were sure",
      tone: "text-good",
      box: after.box,
      line: (
        <>
          {last} → <strong>Box {after.box}</strong>
          {after.box === REMEMBERING_BOX && (
            <>
              , now <strong>Remembering</strong>
            </>
          )}
          . Back <strong>{when}</strong>.
        </>
      ),
    };
  }
  return {
    title: "Correct, but not sure",
    tone: "text-priority",
    box: after.box,
    line: (
      <>
        {before.box ? "Stays in" : "Starts in"} <strong>box {after.box}</strong>
        {before.box ? " and comes back sooner" : ""}: <strong>{when}</strong>.
      </>
    ),
  };
}

/** One answered card, kept for the results at the end. */
interface Answered {
  card: MemoryCard;
  picked: string;
  answer: string;
  r: AnswerResult;
}

/** The same keys as in a quiz. */
const SURENESS_KEYS: Record<string, Sureness> = { s: "sure", w: "wise_guess", n: "not_sure", j: "just_guessed" };
const KEY_FOR: Record<Sureness, string> = { sure: "S", wise_guess: "W", not_sure: "N", just_guessed: "J" };
const MEANING: Record<Sureness, string> = {
  sure: "I am certain.",
  wise_guess: "I narrowed it down and picked the best one.",
  not_sure: "I lean one way but I am not confident.",
  just_guessed: "I had no idea.",
};

/** Every card of the review, with what you picked and what it did, like a quiz's results. */
function ReviewResults({ log, nowMs }: { log: Answered[]; nowMs: number }) {
  const [missedOnly, setMissedOnly] = useState(false);
  const missed = log.filter((l) => !l.r.correct).length;
  const shown = log.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !missedOnly || !l.r.correct);
  return (
    <section aria-labelledby="review-cards" className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h2 id="review-cards" className="eyebrow">
          Every card
        </h2>
        <div className="ml-auto flex gap-1.5" role="group" aria-label="Show">
          {[
            { on: !missedOnly, label: `All ${log.length}`, set: false },
            { on: missedOnly, label: `Missed ${missed}`, set: true },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={f.on}
              onClick={() => setMissedOnly(f.set)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                f.on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="card p-4 text-sm text-muted">Nothing missed.</p>
      ) : (
        <ol className="space-y-2">
          {shown.map(({ l, n }) => {
            const o = outcome(l.r, nowMs);
            return (
              <li key={`${n}-${l.card.id}`} className="card space-y-2 p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="num text-muted">{n}</span>
                  <span className={`font-semibold ${o.tone}`}>{o.title}</span>
                  <span className="text-muted">· {SURENESS_LABEL[l.r.sureness]}</span>
                  {l.r.daily && !l.r.before.unlocked && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-muted">Preview</span>
                  )}
                </div>
                <RichText text={l.card.prompt} className="font-medium" />
                <div
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    l.r.correct ? "border-good bg-good/10" : "border-danger bg-danger/10"
                  }`}
                >
                  <span className="shrink-0 text-xs text-muted">{l.r.correct ? "Your answer" : "You picked"}</span>
                  <RichText text={l.picked} className="min-w-0 flex-1" />
                </div>
                {!l.r.correct && (
                  <div className="flex items-start gap-2 rounded-md border border-good bg-good/10 px-2.5 py-1.5 text-sm">
                    <span className="shrink-0 text-xs text-muted">The answer</span>
                    <RichText text={l.answer} className="min-w-0 flex-1" />
                  </div>
                )}
                <Boxes box={o.box} />
                <p className="text-sm">{o.line}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

interface Props {
  /** A category id, "mixed" for the mixed deck, or "daily" for the daily review. */
  deck: string;
  /** For the daily review: another whole round, after today's goal is met. */
  more?: boolean;
}

/** A memory review: one card at a time, multiple choice, with how sure you are. */
export default function ReviewRunner({ deck, more = false }: Props) {
  const nodes = useNodes();
  const data = useMemory();
  const nowMs = useNow();
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<ReviewChoice[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [sureness, setSureness] = useState<Sureness | null>(null);
  const [log, setLog] = useState<Answered[]>([]);
  // Said once on the next card, when an answer opened a new one.
  const [notice, setNotice] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0, opened: 0 });
  const [busy, setBusy] = useState(false);
  // Read once as the review starts, so flipping the switch midway changes nothing.
  const [incognito, setIncognito] = useState(false);
  const started = useRef(false);

  const cardById = new Map((data?.cards ?? []).map((c) => [c.id, c]));
  // Starting opens the new cards each deck has earned, so it runs only once.
  const ready = !!data;
  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    void (async () => {
      const off = loadIncognito();
      let s: Session;
      if (deck === "daily") s = await startDaily(await loadDailySize(), off, more);
      else {
        const decks = deck === "mixed" ? (loadMix() ?? []) : [deck];
        if (!decks.length) {
          setProblem("Choose the categories for your mixed deck first.");
          return;
        }
        s = await startSession(decks, off);
      }
      setIncognito(off);
      const card = s.queue.length ? await db.cards.get(s.queue[0]) : undefined;
      if (card) setChoices(reviewChoices(card));
      setSession(s);
    })();
  }, [ready, deck, more]);

  const card: MemoryCard | undefined = session ? cardById.get(session.queue[index]) : undefined;
  const done = !!session && index >= session.queue.length;

  /** Saves the answer and goes straight to the next card, as a quiz does. What it did is shown at the end. */
  async function submit() {
    if (!card || !session || picked === null || !sureness || busy) return;
    setBusy(true);
    try {
      const choice = choices[picked];
      const r = await answerCard(card, choice.correct, sureness, choice.text, incognito, !!session.daily);
      const answer = choices.find((c) => c.correct)?.text ?? card.answer;
      setLog((l) => [...l, { card, picked: choice.text, answer, r }]);
      setScore((s) => ({
        right: s.right + (choice.correct ? 1 : 0),
        wrong: s.wrong + (choice.correct ? 0 : 1),
        opened: s.opened + r.opened.length,
      }));
      const queue = r.opened.length ? [...session.queue, ...r.opened.map((c) => c.id)] : session.queue;
      if (r.opened.length) setSession({ ...session, queue });
      setNotice(
        r.opened.length ? "That card is now Remembering, so 1 new card is unlocked. It joins at the end." : null,
      );
      const i = index + 1;
      // A card opened just now is not in the loaded list yet, so it is read from the database.
      const nextCard = cardById.get(queue[i]) ?? (queue[i] ? await db.cards.get(queue[i]) : undefined);
      setIndex(i);
      setPicked(null);
      setSureness(null);
      if (nextCard) setChoices(reviewChoices(nextCard));
    } finally {
      setBusy(false);
    }
  }

  // The quiz keys: A to D pick a choice (1 to 4 also work), S, W, N or J say how sure, and Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      const letter = LETTERS.toLowerCase().indexOf(key);
      const digit = /^[1-4]$/.test(key) ? Number(key) - 1 : -1;
      const pick = key.length === 1 && letter >= 0 ? letter : digit;
      if (pick >= 0 && pick < choices.length) {
        e.preventDefault();
        setPicked(pick);
      } else if (key in SURENESS_KEYS && picked !== null) {
        e.preventDefault();
        setSureness(SURENESS_KEYS[key]);
      } else if (e.key === "Enter" && picked !== null && sureness) {
        e.preventDefault();
        void submit();
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
  const title = deck === "daily" ? "Daily review" : deck === "mixed" ? "Mixed deck" : (catOf(deck)?.name ?? "Memory");
  const previewCount = session.locked?.length ?? 0;
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
          <span>
            {title}
            {incognito && <IncognitoTag />}
          </span>
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
            <p className="text-sm text-muted">
              {deck === "daily"
                ? incognito
                  ? "No card is unlocked yet, so there is nothing to practise."
                  : "Today's daily goal is met, or every card has come up in it already. Your decks still have their own reviews."
                : incognito
                  ? `No card in ${title} is unlocked yet, so there is nothing to practise.`
                  : `Nothing in ${title} is due today. Come back tomorrow.`}
            </p>
          ) : (
            <p className="text-sm">
              {total} card{total === 1 ? "" : "s"}: <span className="font-semibold text-good">{score.right} right</span>
              , <span className="font-semibold text-danger">{score.wrong} missed</span>.
              {incognito && " Incognito, so no card moved."}
              {score.opened > 0 &&
                ` Remembering ${score.opened === 1 ? "one card" : `${score.opened} cards`} opened ${score.opened === 1 ? "a new one" : "new ones"}.`}
            </p>
          )}
          {session.daily && total > 0 && !incognito && (
            <p className="text-sm text-muted">
              Daily practice: right answers leave cards as they were, and a missed card goes back to box 1 for its
              deck&apos;s review.
              {previewCount > 0 &&
                ` ${previewCount === 1 ? "One card was" : `${previewCount} cards were`} still locked, as a preview.`}
            </p>
          )}
          {session.extra > 0 && (
            <p className="text-sm text-muted">
              {session.extra} extra new card{session.extra === 1 ? "" : "s"} came up today to keep pace with the exam.
            </p>
          )}
        </div>
        {log.length > 0 && <ReviewResults log={log} nowMs={nowMs} />}
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
        {session.locked?.includes(card.id) ? (
          <span
            className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted"
            title="Still locked: a preview of what is coming in its deck"
          >
            Preview
          </span>
        ) : (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{boxLabel(state)}</span>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-accent-soft p-2.5 text-sm text-accent">
          {notice}
        </p>
      )}
      <RichText text={card.prompt} className="text-xl leading-snug font-semibold" />

      <div role="radiogroup" aria-label="Choices" className="flex flex-col gap-2.5">
        {choices.map((c, i) => {
          const on = picked === i;
          const look = on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-paper";
          return (
            <button
              key={i}
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(i)}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-2 text-left text-base ${look}`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md text-xs ${
                  on ? "bg-accent font-semibold text-white" : "border border-line text-muted"
                }`}
              >
                {LETTERS[i]}
              </span>
              <RichText text={c.text} className="min-w-0 flex-1" />
            </button>
          );
        })}
      </div>

      <div className="mt-auto space-y-2.5">
        <p className="text-sm text-muted">How sure are you?</p>
        <div role="radiogroup" aria-label="How sure" className="grid grid-cols-2 gap-2">
          {SURENESS_ORDER.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={sureness === s}
              disabled={picked === null}
              title={MEANING[s]}
              onClick={() => setSureness(s)}
              className={`min-h-11 rounded-md border-[1.5px] text-sm disabled:opacity-50 ${
                sureness === s
                  ? "border-priority bg-priority-soft font-semibold text-priority"
                  : "border-line bg-surface"
              }`}
            >
              {SURENESS_LABEL[s]}
              <span className="ml-1 text-xs opacity-60 max-lg:hidden">{KEY_FOR[s]}</span>
            </button>
          ))}
        </div>
        {picked === null && (
          <p className="text-xs text-muted">
            Pick a choice first.<span className="max-lg:hidden"> The keys A to D also pick.</span>
          </p>
        )}
        <button
          className="btn btn-primary min-h-12 w-full"
          disabled={picked === null || !sureness || busy}
          onClick={() => void submit()}
        >
          {index + 1 < total ? "Submit" : "Submit and finish"}
          <span className="ml-1 text-xs opacity-70 max-lg:hidden">Enter</span>
        </button>
      </div>
    </div>
  );
}
