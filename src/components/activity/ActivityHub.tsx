"use client";

import Link from "next/link";
import { useNodes, useNow } from "@/lib/hooks";
import { dailyLeft, useMemory, summarize, type DeckSummary } from "@/lib/memory/review";
import { useMix } from "@/lib/memory/mix";
import { answeredToday, useDailySize } from "@/lib/memory/daily";
import { formatDate } from "@/lib/format";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { useIncognito } from "@/lib/incognito";
import { IncognitoNote, IncognitoSwitch } from "@/components/ui/Incognito";

/** "9 due · 1 new" */
function dueText(s: Pick<DeckSummary, "due" | "fresh">) {
  if (!s.due && !s.fresh) return "Nothing due";
  return [s.due && `${s.due} due`, s.fresh && `${s.fresh} new`].filter(Boolean).join(" · ");
}

/** Activity: memory reviews now, games later. */
export default function ActivityHub() {
  const nodes = useNodes();
  const data = useMemory();
  const mix = useMix();
  const nowMs = useNow();
  const incognito = useIncognito();
  const dailySize = useDailySize();
  if (!nodes || !data || dailySize === undefined) return <LoadingScreen />;

  const categories = nodes.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order);
  const decks = categories.map((c) => ({ node: c, s: summarize(data, c.id, nowMs) }));
  const mixed = decks.filter((d) => mix?.includes(d.node.id));
  // Counted together, so a card shared between decks counts once.
  const mixSum = summarize(
    data,
    mixed.map((d) => d.node.id),
    nowMs,
  );
  const everything = summarize(
    data,
    categories.map((c) => c.id),
    nowMs,
  );
  // Incognito, any unlocked card can be practised, due or not.
  const canReview = (s: { due: number; fresh: number; open: number }) => (incognito ? s.open : s.due + s.fresh) > 0;
  const deckText = (s: DeckSummary) => (incognito ? `${s.open} to practise` : dueText(s));
  const totalDue = everything.due + everything.fresh;
  const noCards = data.cards.length === 0;
  const pace = data.exam && everything.perDay !== null;
  const catchingUp = everything.extra;
  const answered = answeredToday(data.events, nowMs);
  const goalMet = answered >= dailySize;
  // The daily review is practice on the side, so the deck reviews have nothing to do with being done for the day.
  const dayDone = goalMet;
  // Cards from any deck, locked or not, that have not come up in today's daily review yet.
  const dailyReady =
    dailyLeft(
      data,
      nowMs,
      categories.map((c) => c.id),
    ) > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Activity</h1>
            <p className="mt-1 text-sm text-muted">Memory reviews and games. They work on every device.</p>
          </div>
          <IncognitoSwitch />
        </div>
        <IncognitoNote what="review" />
      </div>

      <section aria-labelledby="memory-title" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="memory-title" className="eyebrow">
            Memory
          </h2>
          {!noCards && (
            <span className="text-sm text-muted">
              <span className="num font-semibold text-accent">{totalDue}</span> to review today
            </span>
          )}
        </div>

        {noCards ? (
          <p className="card p-5 text-sm text-muted">
            No memory cards yet. Add them on your main device in Bank › Memory: the constants, conversions, formulas,
            principles, definitions, units and ranges to know by heart.
          </p>
        ) : (
          <>
            <div className="card space-y-3 p-4" aria-labelledby="daily-title">
              <div className="flex items-baseline gap-2">
                <h3 id="daily-title" className="font-semibold">
                  Daily review
                </h3>
                <span className="text-sm text-muted">every deck</span>
                <Link href="/settings#daily" className="ml-auto text-sm text-muted underline">
                  {dailySize} a day
                </Link>
              </div>
              {incognito ? (
                <p className="text-sm text-muted">
                  Practise {dailySize} cards from every deck, with a few locked ones as a preview. Nothing is recorded.
                </p>
              ) : (
                <>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-track"
                    role="progressbar"
                    aria-label="Today's goal"
                    aria-valuemin={0}
                    aria-valuemax={dailySize}
                    aria-valuenow={Math.min(answered, dailySize)}
                  >
                    <div
                      className={`h-full ${goalMet ? "bg-good" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, (answered / dailySize) * 100)}%` }}
                    />
                  </div>
                  <p className="text-sm">
                    {dayDone ? (
                      <span className="font-medium text-good">Done for today: {answered} cards answered.</span>
                    ) : goalMet ? (
                      <>
                        Goal met with <span className="num font-semibold">{answered}</span> cards.
                      </>
                    ) : (
                      <>
                        <span className="num font-semibold">{answered}</span> of{" "}
                        <span className="num">{dailySize}</span> today
                        <span className="text-muted"> · practice from every deck; only misses count</span>
                      </>
                    )}
                  </p>
                </>
              )}
              {!incognito && !dayDone && !dailyReady && answered > 0 && (
                <p className="text-sm text-muted">
                  Every card has come up in today&apos;s daily review already. Your decks still have their own reviews.
                </p>
              )}
              {dailyReady && (
                <Link
                  href={dayDone && !incognito ? "/activity/review?deck=daily&more=1" : "/activity/review?deck=daily"}
                  className={`btn ${dayDone && !incognito ? "" : "btn-primary"} w-full min-h-11 sm:w-auto`}
                >
                  {incognito
                    ? "Practise"
                    : dayDone
                      ? "Another round"
                      : answered > 0
                        ? "Keep going"
                        : "Start daily review"}
                </Link>
              )}
            </div>

            <div className="rounded-lg bg-accent p-4 text-white">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Mixed deck</span>
                <Link href="/activity/mix" className="ml-auto text-sm text-white/85 underline">
                  {mix?.length ? "Edit mix" : "Choose a mix"}
                </Link>
              </div>
              {mixed.length ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mixed.map((d) => (
                      <span key={d.node.id} className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">
                        {d.node.name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span>
                      <span className="num text-2xl font-semibold">{mixSum.due}</span> due
                    </span>
                    <span>
                      <span className="num text-2xl font-semibold">{mixSum.fresh}</span> new
                    </span>
                    {canReview(mixSum) && (
                      <Link
                        href="/activity/review?deck=mixed"
                        className="ml-auto rounded-md bg-white/15 px-3 py-2 font-semibold hover:bg-white/25"
                      >
                        {incognito ? "Practise" : "Review"}
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-white/85">Review any categories together, such as GEAS and ESAT.</p>
              )}
            </div>

            <ul className="card divide-y divide-line">
              {decks.map(({ node, s }) => {
                const key = categoryKey(node.name);
                const learnedPct = s.total ? (s.learned / s.total) * 100 : 0;
                const ready = canReview(s);
                const body = (
                  <>
                    {key && <span aria-hidden="true" className={`size-2.5 rounded-sm ${CATEGORY_STYLE[key].bar}`} />}
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="font-medium">{node.name}</span>
                      <span className="h-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
                        <span className="block h-full bg-accent" style={{ width: `${learnedPct}%` }} />
                      </span>
                    </span>
                    <span className="w-28 text-right text-sm text-muted">
                      {s.total ? deckText(s) : "No cards"}
                      <span className="block text-xs">
                        {s.learned} of {s.total} learned
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={node.id}>
                    {ready ? (
                      <Link
                        href={`/activity/review?deck=${node.id}`}
                        className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-paper"
                        aria-label={`${incognito ? "Practise" : "Review"} ${node.name}: ${deckText(s)}`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">
              The bar is how much of each deck is learned: remembered at the 60-day review.{" "}
              {pace && data.exam
                ? catchingUp > 0
                  ? `Keeping pace with the exam: ${catchingUp} extra new card${catchingUp === 1 ? "" : "s"} today, so every card comes up by ${formatDate(data.exam.allSeenBy)}.`
                  : `On pace: every card comes up by ${formatDate(data.exam.allSeenBy)}.`
                : "New cards open as you remember the ones you have."}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="games-title" className="space-y-3">
        <h2 id="games-title" className="eyebrow">
          Games
        </h2>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-line p-4">
          <span className="font-medium">Streak</span>
          <span className="text-sm text-muted">Coming next: quick questions, 30 s each.</span>
        </div>
      </section>
    </div>
  );
}
