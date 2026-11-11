"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNodes, useNow } from "@/lib/hooks";
import { useMemory, summarize } from "@/lib/memory/review";
import { saveMix, useMix } from "@/lib/memory/mix";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import LoadingScreen from "@/components/layout/LoadingScreen";

/** Choosing which categories go in the mixed deck. */
export default function MixSetup() {
  const router = useRouter();
  const nodes = useNodes();
  const data = useMemory();
  const saved = useMix();
  const nowMs = useNow();
  const [picked, setPicked] = useState<string[] | null>(null);
  if (!nodes || !data) return <LoadingScreen />;

  const categories = nodes.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order);
  const chosen = picked ?? saved ?? [];
  const sums = categories.map((c) => ({ node: c, s: summarize(data, c.id, nowMs) }));
  const inMix = sums.filter((x) => chosen.includes(x.node.id));
  const total = inMix.reduce((n, x) => n + x.s.total, 0);
  const due = inMix.reduce((n, x) => n + x.s.due, 0);
  const fresh = inMix.reduce((n, x) => n + x.s.fresh, 0);
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <Link href="/activity" className="text-sm text-muted underline">
          Back to Activity
        </Link>
        <h1 className="mt-2 text-xl font-semibold">What goes in the mix?</h1>
        <p className="mt-1 text-sm text-muted">
          Pick any categories. Each card keeps one record of progress, whether you review it here or in its own deck.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Categories</legend>
        {sums.map(({ node, s }) => {
          const key = categoryKey(node.name);
          const on = chosen.includes(node.id);
          return (
            <label
              key={node.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-4 ${
                on ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-accent)]"
                checked={on}
                onChange={() => toggle(node.id)}
              />
              {key && <span aria-hidden="true" className={`size-2.5 rounded-sm ${CATEGORY_STYLE[key].bar}`} />}
              <span className="flex-1 font-medium">{node.name}</span>
              <span className="text-sm text-muted">
                {s.total} card{s.total === 1 ? "" : "s"} · {s.due + s.fresh} today
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="card flex gap-6 p-4">
        <span>
          <span className="num block text-2xl font-semibold">{total}</span>
          <span className="text-xs text-muted">cards</span>
        </span>
        <span>
          <span className="num block text-2xl font-semibold text-accent">{due}</span>
          <span className="text-xs text-muted">due today</span>
        </span>
        <span>
          <span className="num block text-2xl font-semibold">{fresh}</span>
          <span className="text-xs text-muted">new</span>
        </span>
      </div>
      <p className="text-sm text-muted">
        New cards open as you remember: each card that reaches Remembering (box 3, about a week of recall) opens one
        more. A card you miss goes back to box 1.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={!chosen.length || due + fresh === 0}
          onClick={() => {
            saveMix(chosen);
            router.push("/activity/review?deck=mixed");
          }}
        >
          {due + fresh ? `Save and review · ${due + fresh} cards` : "Nothing due in this mix"}
        </button>
        <button
          className="btn"
          disabled={!chosen.length}
          onClick={() => {
            saveMix(chosen);
            router.push("/activity");
          }}
        >
          Save the mix
        </button>
      </div>
      <p className="text-xs text-muted">Your mix is remembered on this device.</p>
    </div>
  );
}
