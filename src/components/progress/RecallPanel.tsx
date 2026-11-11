"use client";

import { useState } from "react";
import Link from "next/link";
import type { CardEvent, Sureness } from "@/lib/db";
import { useNodes, useNow } from "@/lib/hooks";
import { useMemory } from "@/lib/memory/review";
import { CARD_KINDS } from "@/lib/memory/cards";
import { DAY, TOP_BOX, isDue, planUnlocks, stageOf, startOfDay, type Stage } from "@/lib/memory/schedule";
import { SURENESS_LABEL, SURENESS_ORDER } from "@/lib/quiz/scoring";
import RichText from "@/components/ui/RichText";
import LoadingScreen from "@/components/layout/LoadingScreen";

const STAGES: { id: Stage; label: string; hint: string; color: string }[] = [
  { id: "new", label: "New", hint: "unlocked, not answered yet", color: "bg-accent/30" },
  { id: "learning", label: "Learning", hint: "box 1–2", color: "bg-accent/60" },
  { id: "remembering", label: "Remembering", hint: "box 3–6", color: "bg-accent" },
  { id: "learned", label: "Learned", hint: "back every 90 days", color: "bg-good" },
  { id: "locked", label: "Locked", hint: "open as you remember", color: "bg-track" },
];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Right answers out of all answers, as a whole percent, or null with no answers. */
function rate(answers: CardEvent[]): number | null {
  return answers.length ? pct(answers.filter((e) => e.correct).length, answers.length) : null;
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num text-2xl font-semibold ${accent ? "text-accent" : ""}`}>{value}</span>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );
}

/** Analytics › Recall: how memory cards are going, kept apart from quiz analytics. */
export default function RecallPanel() {
  const nodes = useNodes();
  const data = useMemory();
  const nowMs = useNow();
  const [deck, setDeck] = useState<string | null>(null);
  if (!nodes || !data) return <LoadingScreen />;

  if (!data.cards.length) {
    return (
      <p className="rounded-md border border-dashed border-line p-8 text-center text-sm text-muted">
        Recall appears once there are memory cards to review. Add them in Bank › Memory, then review them in{" "}
        <Link href="/activity" className="underline">
          Activity
        </Link>
        .
      </p>
    );
  }

  const categories = nodes.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order);
  const cards = deck ? data.cards.filter((c) => c.categoryId === deck) : data.cards;
  const ids = new Set(cards.map((c) => c.id));
  const kindOf = new Map(cards.map((c) => [c.id, c.kind]));
  const answers = data.events.filter((e) => e.type === "answer" && !e.deletedAt && ids.has(e.cardId));
  const since = (days: number) => startOfDay(nowMs) - days * DAY;
  const last30 = answers.filter((e) => e.at >= since(30));
  const prev30 = answers.filter((e) => e.at >= since(60) && e.at < since(30));
  const recall = rate(last30);
  const before = rate(prev30);

  // Stages, and cards per box.
  const stageCount = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>;
  const boxes = Array(TOP_BOX).fill(0) as number[];
  for (const c of cards) {
    const s = data.states.get(c.id);
    const stage = stageOf(s);
    stageCount[stage]++;
    if (s && s.box > 0 && !s.learned) boxes[s.box - 1]++;
  }
  // Cards that would open at the next review count as new, not locked.
  for (const cat of categories) {
    if (deck && cat.id !== deck) continue;
    const deckCards = data.cards.filter((c) => c.categoryId === cat.id);
    const opening = planUnlocks(deckCards, data.states, data.exam, nowMs, 0).cards.length;
    stageCount.locked -= opening;
    stageCount.new += opening;
  }
  const biggestBox = Math.max(1, ...boxes);

  // Due over the next 7 days.
  const ahead = Array.from({ length: 7 }, (_, d) => {
    const end = startOfDay(nowMs) + (d + 1) * DAY;
    const start = d === 0 ? -Infinity : end - DAY;
    const n = cards.filter((c) => {
      const s = data.states.get(c.id);
      if (!s || !s.unlocked) return false;
      if (d === 0) return isDue(s, nowMs);
      return s.dueAt !== null && s.dueAt >= start && s.dueAt < end;
    }).length;
    return { day: new Date(end - DAY).toLocaleDateString(undefined, { weekday: "short" }), n };
  });
  const dueWeek = ahead.reduce((n, d) => n + d.n, 0);
  const biggestDay = Math.max(1, ...ahead.map((d) => d.n));

  // Recall by kind, over 30 days.
  const byKind = CARD_KINDS.map((k) => {
    const list = last30.filter((e) => kindOf.get(e.cardId) === k.id);
    return { ...k, n: list.length, r: rate(list) };
  }).filter((k) => k.n > 0);
  const weakestKind = byKind.length > 1 ? byKind.reduce((a, b) => ((a.r ?? 100) <= (b.r ?? 100) ? a : b)) : null;

  // How sure against how right.
  const bySure = SURENESS_ORDER.map((s: Sureness) => {
    const list = last30.filter((e) => e.sureness === s);
    return { s, n: list.length, r: rate(list) };
  });
  const sureWrongWeek = answers.filter((e) => e.at >= since(7) && e.sureness === "sure" && !e.correct).length;

  // The cards missed most.
  const hardest = cards
    .map((c) => ({ c, s: data.states.get(c.id) }))
    .filter((x) => x.s && x.s.misses > 0)
    .sort((a, b) => b.s!.misses - a.s!.misses || (b.s!.lastAt ?? 0) - (a.s!.lastAt ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Deck">
        {[{ id: null as string | null, name: "All decks" }, ...categories].map((c) => (
          <button
            key={c.id ?? "all"}
            aria-pressed={deck === c.id}
            onClick={() => setDeck(c.id)}
            className={`min-h-9 rounded-full border px-3 text-sm ${
              deck === c.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Learned"
          value={`${pct(stageCount.learned, cards.length)}%`}
          sub={`${stageCount.learned} of ${cards.length}`}
        />
        <Tile
          label="Recall, 30 days"
          value={recall === null ? "–" : `${recall}%`}
          sub={
            recall === null
              ? "No reviews yet"
              : before === null
                ? `${last30.length} answers`
                : recall === before
                  ? "Same as the 30 days before"
                  : `${recall > before ? "↑" : "↓"} ${Math.abs(recall - before)} from the 30 days before`
          }
          accent
        />
        <Tile label="Due, 7 days" value={String(dueWeek)} sub={`${ahead[0].n} today`} />
      </div>

      <section className="card space-y-3 p-4" aria-labelledby="stages-title">
        <h2 id="stages-title" className="font-semibold">
          Cards by stage
        </h2>
        <div
          className="flex h-3 overflow-hidden rounded-full"
          role="img"
          aria-label={STAGES.map((s) => `${s.label} ${stageCount[s.id]}`).join(", ")}
        >
          {STAGES.map((s) =>
            stageCount[s.id] ? (
              <span key={s.id} className={s.color} style={{ width: `${(stageCount[s.id] / cards.length) * 100}%` }} />
            ) : null,
          )}
        </div>
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {STAGES.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-2.5 rounded-sm ${s.color}`} />
              <span>
                {s.label} <span className="num font-medium">{stageCount[s.id]}</span>{" "}
                <span className="text-muted">({s.hint})</span>
              </span>
            </li>
          ))}
        </ul>

        <h3 className="pt-2 text-sm font-medium text-muted">Cards in each box</h3>
        <div
          className="flex h-28 items-end gap-2"
          role="img"
          aria-label={boxes.map((n, i) => `Box ${i + 1}: ${n}`).join(", ")}
        >
          {boxes.map((n, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="num text-xs text-muted">{n}</span>
              <span
                className={`w-full rounded-t ${i + 1 >= 3 ? "bg-accent" : "bg-accent/60"}`}
                style={{ height: `${(n / biggestBox) * 80}%`, minHeight: n ? 3 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 text-xs text-muted">
          {boxes.map((_, i) => (
            <span key={i} className="flex-1 text-center">
              {i + 1}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted">
          A card is learned once you get it right and sure at the 60-day review. Locked cards open as more cards reach
          Remembering
          {data.exam ? ", and early when needed to keep pace with the exam" : ""}.
        </p>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="ahead-title">
        <h2 id="ahead-title" className="font-semibold">
          Coming up
        </h2>
        <div
          className="flex h-20 items-end gap-2"
          role="img"
          aria-label={ahead.map((d) => `${d.day}: ${d.n}`).join(", ")}
        >
          {ahead.map((d, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="num text-xs text-muted">{d.n}</span>
              <span
                className={`w-full rounded-t ${i === 0 ? "bg-accent" : "bg-accent/50"}`}
                style={{ height: `${(d.n / biggestDay) * 70}%`, minHeight: d.n ? 3 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 text-xs text-muted">
          {ahead.map((d, i) => (
            <span key={i} className="flex-1 text-center">
              {i === 0 ? "Today" : d.day}
            </span>
          ))}
        </div>
      </section>

      {byKind.length > 0 && (
        <section className="card space-y-3 p-4" aria-labelledby="kind-title">
          <h2 id="kind-title" className="font-semibold">
            Recall by kind, 30 days
          </h2>
          <div className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-2 text-sm">
            {byKind.map((k) => {
              const weak = weakestKind?.id === k.id;
              return (
                <div key={k.id} className="contents">
                  <span>{k.plural}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-track">
                    <span
                      className={`block h-full ${weak ? "bg-priority-solid" : "bg-accent"}`}
                      style={{ width: `${k.r ?? 0}%` }}
                    />
                  </span>
                  <span className={`num text-right ${weak ? "text-priority" : ""}`}>{k.r}%</span>
                </div>
              );
            })}
          </div>
          {weakestKind && <p className="text-xs text-muted">{weakestKind.plural} need the most work right now.</p>}
        </section>
      )}

      {last30.length > 0 && (
        <section className="card space-y-2 p-4" aria-labelledby="sure-title">
          <h2 id="sure-title" className="font-semibold">
            How sure vs how right, 30 days
          </h2>
          {bySure
            .filter((x) => x.n > 0)
            .map((x) => (
              <div key={x.s} className="flex justify-between text-sm">
                <span>{SURENESS_LABEL[x.s]}</span>
                <span>
                  <span className="num">{x.r}%</span> right{" "}
                  <span className="text-muted">
                    of <span className="num">{x.n}</span>
                  </span>
                </span>
              </div>
            ))}
          {sureWrongWeek > 0 && (
            <p className="text-sm text-priority">
              {sureWrongWeek} answer{sureWrongWeek === 1 ? "" : "s"} you marked Sure{" "}
              {sureWrongWeek === 1 ? "was" : "were"} wrong this week.
            </p>
          )}
        </section>
      )}

      {hardest.length > 0 && (
        <section className="space-y-2" aria-labelledby="hard-title">
          <h2 id="hard-title" className="font-semibold">
            Hardest cards
          </h2>
          <ul className="card divide-y divide-line">
            {hardest.map(({ c, s }) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <RichText text={c.prompt} className="min-w-0 flex-1" />
                <span className="shrink-0 text-xs text-muted">
                  missed {s!.misses}× · {stageOf(s) === "learned" ? "learned" : `box ${s!.box}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
