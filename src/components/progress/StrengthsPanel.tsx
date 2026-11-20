"use client";

import { useReadOnly } from "@/lib/sync/syncState";
import { useState } from "react";
import Link from "next/link";
import {
  minAnswersFor,
  rankStandings,
  standingsOf,
  type Obs,
  type Ranking,
  type Standing,
  type StandingKind,
} from "@/lib/progress/analytics";
import { CONFIG } from "@/lib/config";
import { useNodes } from "@/lib/hooks";
import WithinPicker, { type Within } from "./WithinPicker";
import { formatPercent, formatRatio } from "@/lib/format";
import InfoTip from "@/components/ui/InfoTip";

interface ListInfo {
  id: Ranking;
  title: string;
  /** A few words saying what the list means. */
  means: string;
  note: string;
}

const WEAKEST: ListInfo = {
  id: "weakest",
  title: "Weakest",
  means: "Lowest credit",
  note: "The lowest average credit, among tags or questions still under your goal. Once one reaches the goal it leaves this list. Unanswered questions count as zero.",
};
const SURE: ListInfo = {
  id: "sure",
  title: "Always sure",
  means: "Says Sure most often",
  note: "Where you say Sure most often. The second line says how often you were right when you did. It turns red when that is under 90%, because then Sure cannot be trusted.",
};
const MISCONCEPTIONS: ListInfo = {
  id: "misconception",
  title: "Misconceptions",
  means: "Sure but wrong",
  note: "Where you were wrong while saying Sure: you believed something that is not true, so these are the most important to fix. In the Questions view, a question that keeps showing up here may have a wrong answer key, so open it and check.",
};
const UNPREPARED: ListInfo = {
  id: "unprepared",
  title: "Unprepared",
  means: "Not sure or just guessed",
  note: "Where you answered Not sure or Just guessed most often, whether or not the answer was right. Right answers like these are luck, and they cost you credit.",
};
const FASTEST: ListInfo = {
  id: "fastest",
  title: "Fastest",
  means: "Quick and mostly right",
  note: `The least time compared with the target, among tags or questions you get right at least ${Math.round(CONFIG.stats.fastMinAccuracy * 100)}% of the time. Under 1.0× is faster than the target.`,
};
const SLOWEST: ListInfo = {
  id: "slowest",
  title: "Slowest",
  means: "Most time",
  note: "The most time compared with the target. 1.0× is exactly on target, and more than that is slower. Time never changes your score.",
};
const CARELESS: ListInfo = {
  id: "careless",
  title: "Careless",
  means: "Fast but wrong",
  note: `Where you were wrong after using less than ${Math.round(CONFIG.stats.fastRatio * 100)}% of the target time. You probably knew it, so read the question again before you answer.`,
};

/** Each list's title and what it means, for other places that show the same lists. */
export const LISTS: Record<Ranking, ListInfo> = {
  weakest: WEAKEST,
  sure: SURE,
  misconception: MISCONCEPTIONS,
  unprepared: UNPREPARED,
  fastest: FASTEST,
  slowest: SLOWEST,
  careless: CARELESS,
};

const GROUPS: { title: string; lists: ListInfo[] }[] = [
  { title: "Accuracy", lists: [WEAKEST] },
  { title: "Confidence", lists: [SURE, MISCONCEPTIONS, UNPREPARED] },
  { title: "Speed", lists: [FASTEST, SLOWEST, CARELESS] },
];

/** What a row shows on the right, and what it shows under its name. */
export function figures(row: Standing, ranking: Ranking, bar: number): { value: string; tone: string; sub: string } {
  const asked =
    row.topics !== undefined ? `${row.n} asked · ${row.topics} topic${row.topics === 1 ? "" : "s"}` : `${row.n} asked`;
  const of = (n: number, what: string) => `${n} of ${row.answered} ${what}`;
  switch (ranking) {
    case "weakest":
      return {
        value: formatPercent(row.credit),
        tone: row.credit + 1e-9 >= bar ? "text-good" : "text-danger",
        sub: `${asked} · ${formatPercent(row.accuracy, 0)} right`,
      };
    case "slowest":
    case "fastest":
      return {
        value: formatRatio(row.pace),
        tone: "",
        sub: `${asked} · ${formatPercent(row.accuracy, 0)} right`,
      };
    case "sure":
      return {
        value: `${formatPercent(row.sureRate, 0)} Sure`,
        tone: row.sureRight + 1e-9 < CONFIG.stats.sureTrust ? "text-danger" : "",
        sub: `${asked} · right ${formatPercent(row.sureRight, 0)} if Sure`,
      };
    case "misconception":
      return {
        value: formatPercent(row.sureWrong / row.answered, 0),
        tone: "text-danger",
        sub: of(row.sureWrong, "Sure but wrong"),
      };
    case "unprepared":
      return {
        value: formatPercent(row.unsure / row.answered, 0),
        tone: "",
        sub: of(row.unsure, "Not sure or guessed"),
      };
    case "careless":
      return {
        value: formatPercent(row.fastWrong / row.answered, 0),
        tone: "text-danger",
        sub: of(row.fastWrong, "wrong and fast"),
      };
  }
}

/** What can be ranked inside each kind of place: the levels below it, then tags and questions. */
const RANKS: Record<Within["kind"], StandingKind[]> = {
  all: ["category", "subject", "topic", "tag", "question"],
  category: ["subject", "topic", "tag", "question"],
  subject: ["topic", "tag", "question"],
  topic: ["tag", "question"],
};
/** What Rank starts on: the level just below, or single questions inside a topic. */
const FIRST_RANK: Record<Within["kind"], StandingKind> = {
  all: "category",
  category: "subject",
  subject: "topic",
  topic: "question",
};
const RANK_LABEL: Record<StandingKind, string> = {
  category: "Categories",
  subject: "Subjects",
  topic: "Topics",
  tag: "Tags",
  question: "Questions",
};
const ONE: Record<StandingKind, string> = {
  category: "category",
  subject: "subject",
  topic: "topic",
  tag: "tag",
  question: "question",
};

/** The answers inside a place: a category, subject or topic, by its id. */
export function inWithin(obs: Obs[], within: Within): Obs[] {
  if (within.kind === "all") return obs;
  if (within.kind === "category") return obs.filter((o) => o.categoryId === within.id);
  if (within.kind === "subject") return obs.filter((o) => o.subjectId === within.id);
  return obs.filter((o) => o.topicId === within.id);
}

/**
 * Short lists in three groups: accuracy (weakest), confidence (always sure, misconceptions, unprepared) and speed
 * (fastest, slowest, careless). Within picks where to look, from everything down to one topic, and Rank picks what
 * the lists are made of: the levels below it, tags (the exempt tags are left out), or single questions.
 */
export default function StrengthsPanel({ obs, bar }: { obs: Obs[]; bar: number }) {
  const readOnly = useReadOnly();
  const nodes = useNodes();
  const [within, setWithin] = useState<Within>({ kind: "all" });
  const [picked, setPicked] = useState<StandingKind | null>(null);

  const byId = new Map((nodes ?? []).map((n) => [n.id, n]));
  // A place that was deleted, or that has no answers any more, falls back to everything.
  const place: Within = within.kind !== "all" && !byId.get(within.id) ? { kind: "all" } : within;
  const ranks = RANKS[place.kind];
  // Rank starts on the level just below the place, and keeps another choice while it still fits.
  const kind = picked && ranks.includes(picked) ? picked : FIRST_RANK[place.kind];
  const present = new Set<string>();
  for (const o of obs) {
    if (o.categoryId) present.add(o.categoryId);
    if (o.subjectId) present.add(o.subjectId);
    if (o.topicId) present.add(o.topicId);
  }
  const names = new Map((nodes ?? []).filter((n) => !n.deletedAt).map((n) => [n.id, n.name]));
  const rows = standingsOf(inWithin(obs, place), kind, names);
  const min = minAnswersFor(kind);
  const placeName = place.kind === "all" ? "any category" : (byId.get(place.id)?.name ?? "this place");

  const chip = (on: boolean) =>
    `rounded px-2.5 py-1 text-sm ${on ? "bg-accent text-white" : "bg-accent-soft text-accent hover:bg-accent/15"}`;

  return (
    <section aria-label="Strengths and weak spots">
      <div className="mb-2 flex items-center gap-1">
        <h3 className="font-medium">What you are good and bad at</h3>
        <InfoTip>
          Within picks where to look: everything, or one category, subject or topic. Rank picks what to compare inside
          it: the levels below it, tags, or single questions. Tags that only say what kind of question it is, such as{" "}
          {CONFIG.exemptTags.join(" and ")}, are left out. A category, subject, topic or tag is listed after{" "}
          {CONFIG.stats.minTagAnswers} answers, and a question after {CONFIG.stats.minQuestionAnswers}. Every quiz you
          finished counts, practice quizzes too.
        </InfoTip>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {nodes && (
          <WithinPicker
            nodes={nodes}
            present={present}
            value={place}
            onChange={(w) => {
              // A new level starts again on the level just below it.
              if (w.kind !== place.kind) setPicked(null);
              setWithin(w);
            }}
          />
        )}
        <div role="group" aria-label="What to rank" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Rank</span>
          {ranks.map((k) => (
            <button key={k} aria-pressed={kind === k} className={chip(kind === k)} onClick={() => setPicked(k)}>
              {RANK_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          {kind === "tag"
            ? `Nothing to show yet. A tag needs at least ${min} answers in ${placeName}, and quizzes only count tags that are not ${CONFIG.exemptTags.join(" or ")}.`
            : `Nothing to show yet. A ${ONE[kind]} needs at least ${min} answers in ${placeName}.`}
        </p>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">{group.title}</h4>
              <div className={`grid gap-3 md:grid-cols-2 ${kind === "question" ? "" : "xl:grid-cols-3"}`}>
                {group.lists.map((list) => {
                  // At or above the goal is no longer a weak spot.
                  const pool = list.id === "weakest" ? rows.filter((r) => r.credit + 1e-9 < bar) : rows;
                  const top = rankStandings(pool, list.id);
                  return (
                    <div key={list.id} className="card">
                      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
                        <h5 className="text-sm font-medium">{list.title}</h5>
                        <span className="text-xs text-muted">· {list.means}</span>
                        <InfoTip>{list.note}</InfoTip>
                      </div>
                      {top.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted">
                          {list.id === "weakest" && rows.length > 0
                            ? `Nothing under your ${formatPercent(bar, 0)} goal.`
                            : "Nothing yet."}
                        </p>
                      ) : (
                        <ol className="divide-y divide-line">
                          {top.map((row) => {
                            const f = figures(row, list.id, bar);
                            return (
                              <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <div className="min-w-0 flex-1">
                                  <p className={kind === "question" ? "line-clamp-2" : "truncate"}>{row.label}</p>
                                  <p className="text-xs text-muted">
                                    {row.topicName && place.kind !== "topic" ? `${row.topicName} · ` : ""}
                                    {f.sub}
                                  </p>
                                </div>
                                <span className={`shrink-0 tabular-nums ${f.tone}`}>{f.value}</span>
                                {kind === "question" && !readOnly && (
                                  <Link href={`/editor?id=${row.key}`} className="btn py-1 max-lg:hidden">
                                    Open
                                  </Link>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
