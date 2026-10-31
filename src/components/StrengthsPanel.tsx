"use client";

import { useState } from "react";
import Link from "next/link";
import { rankStandings, standings, type Obs, type Ranking, type Standing, type StandingKind } from "@/lib/analytics";
import { FIXED_CATEGORIES } from "@/lib/categories";
import { CONFIG } from "@/lib/config";
import { formatPercent, formatRatio } from "@/lib/format";
import InfoTip from "./InfoTip";

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
  note: "The lowest average credit. Unanswered questions count as zero.",
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

const GROUPS: { title: string; lists: ListInfo[] }[] = [
  { title: "Accuracy", lists: [WEAKEST] },
  { title: "Confidence", lists: [SURE, MISCONCEPTIONS, UNPREPARED] },
  { title: "Speed", lists: [FASTEST, SLOWEST, CARELESS] },
];

/** What a row shows on the right, and what it shows under its name. */
function figures(row: Standing, ranking: Ranking, bar: number): { value: string; tone: string; sub: string } {
  const asked = `${row.n} asked`;
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

/**
 * Short lists for one category, in three groups: accuracy (weakest), confidence (always sure, misconceptions,
 * unprepared) and speed (fastest, slowest, careless). They are worked out for tags (the exempt tags are left out) or
 * for single questions.
 */
export default function StrengthsPanel({ obs, bar }: { obs: Obs[]; bar: number }) {
  const [category, setCategory] = useState<string | null>(null);
  const [kind, setKind] = useState<StandingKind>("tag");

  const present = FIXED_CATEGORIES.filter((c) =>
    obs.some((o) => o.categoryName.trim().toLowerCase() === c.name.toLowerCase()),
  );
  const chosen = category !== null && present.some((c) => c.name === category) ? category : null;
  const rows = standings(obs, kind, chosen);
  const min = kind === "tag" ? CONFIG.stats.minTagAnswers : CONFIG.stats.minQuestionAnswers;

  const chip = (on: boolean) =>
    `rounded px-2.5 py-1 text-sm ${on ? "bg-accent text-white" : "bg-accent-soft text-accent hover:bg-accent/15"}`;

  return (
    <section aria-label="Strengths and weak spots">
      <div className="mb-2 flex items-center gap-1">
        <h3 className="font-medium">What you are good and bad at</h3>
        <InfoTip>
          Pick a category to see its tags, or its single questions. Tags are counted across every topic in the category,
          and tags that only say what kind of question it is, such as {CONFIG.exemptTags.join(" and ")}, are left out. A
          tag is listed after {CONFIG.stats.minTagAnswers} answers, and a question after{" "}
          {CONFIG.stats.minQuestionAnswers}. Every quiz you finished counts, practice quizzes too.
        </InfoTip>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          <button aria-pressed={chosen === null} className={chip(chosen === null)} onClick={() => setCategory(null)}>
            All categories
          </button>
          {present.map((c) => (
            <button
              key={c.key}
              aria-pressed={chosen === c.name}
              className={chip(chosen === c.name)}
              onClick={() => setCategory(c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div role="group" aria-label="What to rank" className="flex gap-1.5">
          <button aria-pressed={kind === "tag"} className={chip(kind === "tag")} onClick={() => setKind("tag")}>
            Tags
          </button>
          <button
            aria-pressed={kind === "question"}
            className={chip(kind === "question")}
            onClick={() => setKind("question")}
          >
            Questions
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">
          {kind === "tag"
            ? `Nothing to show yet. A tag needs at least ${min} answers in ${chosen ?? "any category"}, and quizzes only count tags that are not ${CONFIG.exemptTags.join(" or ")}.`
            : `Nothing to show yet. A question needs at least ${min} answers in ${chosen ?? "any category"}.`}
        </p>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">{group.title}</h4>
              <div className={`grid gap-3 md:grid-cols-2 ${kind === "question" ? "" : "xl:grid-cols-3"}`}>
                {group.lists.map((list) => {
                  const top = rankStandings(rows, list.id);
                  return (
                    <div key={list.id} className="rounded-md border border-line bg-surface">
                      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
                        <h5 className="text-sm font-medium">{list.title}</h5>
                        <span className="text-xs text-muted">· {list.means}</span>
                        <InfoTip>{list.note}</InfoTip>
                      </div>
                      {top.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted">Nothing yet.</p>
                      ) : (
                        <ol className="divide-y divide-line">
                          {top.map((row) => {
                            const f = figures(row, list.id, bar);
                            return (
                              <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <div className="min-w-0 flex-1">
                                  <p className={kind === "question" ? "line-clamp-2" : "truncate"}>{row.label}</p>
                                  <p className="text-xs text-muted">
                                    {row.topicName ? `${row.topicName} · ` : ""}
                                    {f.sub}
                                  </p>
                                </div>
                                <span className={`shrink-0 tabular-nums ${f.tone}`}>{f.value}</span>
                                {kind === "question" && (
                                  <Link href={`/editor?id=${row.key}`} className="btn py-1">
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