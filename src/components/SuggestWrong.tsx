"use client";

import { useState } from "react";
import Link from "next/link";
import { useKeyIds } from "@/lib/aiKeys";
import { useProviders } from "@/lib/aiStore";
import { makeAsk } from "@/lib/llmClient";
import type { Ask } from "@/lib/wrongChoices";

interface Props {
  /** Why the button cannot be used right now, or null when it can. */
  blocked: string | null;
  /** How many empty choices there are to fill. */
  count: number;
  /** Asks the AI and puts what it wrote into the empty choices. Returns how many it filled. */
  onSuggest: (ask: Ask, count: number) => Promise<number>;
}

/** A button under the choices that fills the empty ones with plausible wrong answers written by the AI. */
export default function SuggestWrong({ blocked, count, onSuggest }: Props) {
  const providers = useProviders();
  const keyIds = useKeyIds();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // The small in-browser model is left out: it writes weak wrong choices.
  const canRun = (providers ?? []).some((p) => p.enabled && !p.computationOnly && keyIds.includes(p.id));

  async function go() {
    if (!providers) return;
    setBusy(true);
    setResult(null);
    try {
      const filled = await onSuggest(makeAsk(providers), count);
      setResult({
        ok: true,
        text:
          (filled < count ? `Only ${filled} of ${count} suggestions were usable. ` : `Filled ${filled}. `) +
          "Read each one before you save. The AI can occasionally suggest a choice that is also correct, or one that is too easy to rule out.",
      });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "The request failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy || !canRun || blocked !== null}
          onClick={() => void go()}
          title={!canRun ? "Add an AI key first" : (blocked ?? undefined)}
        >
          {busy ? "Thinking…" : "Suggest wrong choices"}
        </button>
        {!canRun ? (
          <span className="text-xs text-muted">
            Add an AI key under{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            to use this.
          </span>
        ) : blocked ? (
          <span className="text-xs text-muted">{blocked}</span>
        ) : (
          <span className="text-xs text-muted">
            Fills the {count} empty choice{count === 1 ? "" : "s"} with plausible wrong answers.
          </span>
        )}
      </div>
      {result && (result.ok || blocked === null) && (
        <p role="status" className={`text-xs ${result.ok ? "text-muted" : "text-danger"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}