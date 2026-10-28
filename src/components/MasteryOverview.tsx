"use client";

import { useState } from "react";
import Link from "next/link";
import { countAvailable } from "@/lib/compose";
import type { TreeNode } from "@/lib/db";
import { EXPIRING_DAYS, expiryMarks, expirySummary, type ExpiryMark } from "@/lib/dashboard";
import { formatCountdown, formatDate } from "@/lib/format";
import { useAttempts, useBlueprints, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { treeMastery, type TreeMastery } from "@/lib/mastery";
import { childrenOf } from "@/lib/tree";
import InfoTip from "./InfoTip";
import LoadingScreen from "./LoadingScreen";

const DAY = 86_400_000;

interface Ctx {
  nodes: TreeNode[];
  mastery: Map<string, TreeMastery>;
  counts: Map<string, number>;
  blueprintFor: Set<string>;
  /** Rows whose mastery, or something under them, runs out soon or has run out. */
  expiring: Map<string, ExpiryMark>;
  expanded: Set<string>;
  toggle: (at: string) => void;
  nowMs: number;
}

function Status({ m, nowMs }: { m: TreeMastery; nowMs: number }) {
  const { info } = m;
  if (info.status === "mastered" && info.expiresAt !== undefined) {
    const left = Math.max(1, Math.ceil((info.expiresAt - nowMs) / DAY));
    const soon = info.expiresAt - nowMs <= EXPIRING_DAYS * DAY;
    return (
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${soon ? "bg-priority-soft text-priority" : "bg-good/10 text-good"}`}
      >
        Mastered until {formatDate(info.expiresAt)} · {left} day{left === 1 ? "" : "s"} left
      </span>
    );
  }
  if (info.status === "expired" && info.expiresAt !== undefined) {
    return (
      <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
        Expired {formatDate(info.expiresAt)}
      </span>
    );
  }
  return <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">Not yet</span>;
}

/** One round "!" badge. It shows a number when more than one row is behind it. */
function Badge({ tone, total, text }: { tone: "expired" | "soon"; total: number; text: string }) {
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={`mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold ${
        tone === "expired" ? "bg-danger text-paper" : "bg-priority-solid text-on-priority"
      }`}
    >
      {total > 1 ? `! ${total}` : "!"}
    </span>
  );
}

/** A red ! when something here has expired, and an amber ! when something runs out soon. Both can show at once. */
function Warn({ mark }: { mark: ExpiryMark }) {
  const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
  const expiredText = [
    mark.expiredSelf ? "This has expired." : "",
    mark.expiredInside > 0
      ? `${items(mark.expiredInside)} inside ${mark.expiredInside === 1 ? "has" : "have"} expired.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const soonText = [
    mark.soonSelf ? `This runs out within ${EXPIRING_DAYS} days.` : "",
    mark.soonInside > 0
      ? `${items(mark.soonInside)} inside run${mark.soonInside === 1 ? "s" : ""} out within ${EXPIRING_DAYS} days.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      {expiredText && (
        <Badge tone="expired" total={(mark.expiredSelf ? 1 : 0) + mark.expiredInside} text={expiredText} />
      )}
      {soonText && <Badge tone="soon" total={(mark.soonSelf ? 1 : 0) + mark.soonInside} text={soonText} />}
    </>
  );
}

function Branch({ node, depth, at, ctx }: { node: TreeNode; depth: number; at: string; ctx: Ctx }) {
  const kids = childrenOf(ctx.nodes, node.id);
  const open = ctx.expanded.has(at);
  const m = ctx.mastery.get(node.id);
  const count = ctx.counts.get(node.id) ?? 0;
  const mark = ctx.expiring.get(node.id);
  if (!m) return null;
  const locked = m.info.lockedUntil !== undefined;

  let childText: string | null = null;
  if (m.childTotal > 0) {
    if (node.kind === "subject") childText = `topics mastered ${m.childMastered}/${m.childTotal}`;
    if (node.kind === "category") childText = `subjects mastered ${m.childMastered}/${m.childTotal}`;
  }

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2 pr-2 hover:bg-paper"
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
          {mark && <Warn mark={mark} />}
          <span className={`text-sm ${node.kind === "category" ? "font-semibold" : ""}`}>{node.name}</span>
          <span className="ml-2 text-xs text-muted">
            {count} question{count === 1 ? "" : "s"}
            {childText ? ` · ${childText}` : ""}
          </span>
        </span>
        <Status m={m} nowMs={ctx.nowMs} />
        {locked && m.info.lockedUntil !== undefined && (
          <span className="text-xs text-danger">Retake in {formatCountdown(m.info.lockedUntil - ctx.nowMs)}</span>
        )}
        <span className="flex gap-1.5">
          {node.kind === "category" ? (
            <>
              <Link href={`/blueprint?category=${node.id}`} className="btn py-1">
                {ctx.blueprintFor.has(node.id) ? "Blueprint" : "Set up blueprint"}
              </Link>
              {ctx.blueprintFor.has(node.id) &&
                (locked ? (
                  <span className="btn pointer-events-none py-1 opacity-40" aria-disabled="true">
                    Mock
                  </span>
                ) : (
                  <Link
                    href={`/quiz/new?node=${node.id}`}
                    className="btn btn-primary py-1"
                    aria-label={`Mock board for ${node.name}`}
                  >
                    Mock
                  </Link>
                ))}
            </>
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
  const blueprints = useBlueprints();
  const nowMs = useNow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!nodes || !attempts || !questions || !blueprints) return <LoadingScreen />;

  const roots = childrenOf(nodes, null);
  const mastery = treeMastery(nodes, attempts, nowMs);
  const summary = expirySummary(nodes, mastery, nowMs);
  const ctx: Ctx = {
    nodes,
    mastery,
    expiring: expiryMarks(nodes, mastery, nowMs),
    counts: new Map(nodes.map((n) => [n.id, countAvailable(nodes, questions, n.id)])),
    blueprintFor: new Set(blueprints.map((b) => b.categoryId)),
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
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-semibold">Mastery</h2>
          <InfoTip>
            Pass a quiz at a level to earn mastery for that level. It lasts 14 days for a topic, 42 for a subject, and
            84 for a category, which you earn with a mock board. A failed quiz locks that same item for 24 hours. A red
            ! means that row, or something inside it, has expired. An amber ! means it runs out within {EXPIRING_DAYS}{" "}
            days. A number next to the ! is how many rows are behind it.
          </InfoTip>
        </div>
        {(summary.expired > 0 || summary.soon > 0) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {summary.expired > 0 && (
              <span>
                <Badge tone="expired" total={1} text="Expired" />
                {summary.expired} expired
              </span>
            )}
            {summary.soon > 0 && (
              <span>
                <Badge tone="soon" total={1} text={`Runs out within ${EXPIRING_DAYS} days`} />
                {summary.soon} running out within {EXPIRING_DAYS} days
              </span>
            )}
          </p>
        )}
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