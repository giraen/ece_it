"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AttemptItem } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { confirmItem, isComplete, saveTime, setSelection, setSureness } from "@/lib/quiz";
import { SURENESS_LABEL, SURENESS_ORDER, type Sureness } from "@/lib/scoring";
import { useStopwatch } from "@/lib/useStopwatch";
import RichText from "./RichText";

const LETTERS = "ABCDEFGH";
const SURENESS_KEYS: Record<string, Sureness> = { s: "sure", w: "wise_guess", n: "not_sure", j: "just_guessed" };
const KEY_FOR: Record<Sureness, string> = { sure: "S", wise_guess: "W", not_sure: "N", just_guessed: "J" };
const MEANING: Record<Sureness, string> = {
  sure: "I am certain.",
  wise_guess: "I narrowed it down and picked the best one.",
  not_sure: "I lean one way but I am not confident.",
  just_guessed: "I had no idea.",
};

// The clock stops while the browser tab is hidden, so time away from the quiz does not count.
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const getVisible = () => document.visibilityState === "visible";
const getServerVisible = () => true;

interface Props {
  attemptId: string;
  index: number;
  total: number;
  item: AttemptItem;
  paused: boolean;
  isLast: boolean;
  onTick: (index: number, ms: number) => void;
  /** Called after the answer is confirmed (or when moving on from an already confirmed one). */
  onAdvance: () => void;
  /** Present only when there is a previous question to go back to. */
  onPrev?: () => void;
}

/** One question: choices, the sureness rating, and a confirm button. Time counts while it is on screen. */
export default function QuestionPane({
  attemptId,
  index,
  total,
  item,
  paused,
  isLast,
  onTick,
  onAdvance,
  onPrev,
}: Props) {
  const visible = useSyncExternalStore(subscribeVisibility, getVisible, getServerVisible);
  const running = visible && !paused;
  const { elapsed, getElapsed } = useStopwatch(running, item.activeMs, (ms) => onTick(index, ms));

  // Save the running time every 10 seconds, whenever the clock stops, and when leaving the question.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void saveTime(attemptId, index, getElapsed()), 10_000);
    return () => window.clearInterval(id);
  }, [running, attemptId, index, getElapsed]);

  useEffect(() => {
    if (!running) void saveTime(attemptId, index, getElapsed());
  }, [running, attemptId, index, getElapsed]);

  useEffect(
    () => () => {
      void saveTime(attemptId, index, getElapsed());
    },
    [attemptId, index, getElapsed],
  );

  const selected = item.selectedChoiceId;
  const complete = isComplete(item);
  const choiceById = new Map(item.choices.map((c) => [c.id, c]));

  const confirmLabel = item.confirmed
    ? isLast
      ? "Submit quiz"
      : "Next question"
    : isLast
      ? "Confirm and submit"
      : "Confirm and next";

  async function confirm() {
    if (!complete || paused) return;
    if (item.confirmed) await saveTime(attemptId, index, getElapsed());
    else await confirmItem(attemptId, index, getElapsed());
    onAdvance();
  }

  // Keyboard: A to H picks a choice, S, W, N, or J rates sureness, and Enter confirms.
  useEffect(() => {
    if (paused) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const letterIdx = LETTERS.toLowerCase().indexOf(key);
      if (key.length === 1 && letterIdx >= 0 && letterIdx < item.choiceOrder.length) {
        e.preventDefault();
        void setSelection(attemptId, index, item.choiceOrder[letterIdx], getElapsed());
      } else if (key in SURENESS_KEYS && selected) {
        e.preventDefault();
        void setSureness(attemptId, index, SURENESS_KEYS[key], getElapsed());
      } else if (e.key === "Enter" && complete) {
        e.preventDefault();
        void (async () => {
          if (item.confirmed) await saveTime(attemptId, index, getElapsed());
          else await confirmItem(attemptId, index, getElapsed());
          onAdvance();
        })();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, attemptId, index, item.choiceOrder, item.confirmed, selected, complete, getElapsed, onAdvance]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted">
        <span>
          Question {index + 1} of {total}
        </span>
        <span className="tabular-nums">
          Question time {formatDuration(elapsed)} · target {formatDuration(item.targetSec * 1000)}
        </span>
      </div>

      {paused ? (
        <div className="rounded-md border border-line bg-surface p-10 text-center">
          <p className="text-lg font-medium">Paused</p>
          <p className="mt-1 text-sm text-muted">The timer is stopped and the question is hidden.</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
            <RichText text={item.stem} className="text-[17px] leading-relaxed" />
          </div>

          <div role="radiogroup" aria-label="Choices" className="mt-4 space-y-2">
            {item.choiceOrder.map((cid, i) => {
              const choice = choiceById.get(cid);
              if (!choice) return null;
              const isSelected = selected === cid;
              return (
                <div
                  key={cid}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => void setSelection(attemptId, index, cid, getElapsed())}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.preventDefault();
                      void setSelection(attemptId, index, cid, getElapsed());
                    }
                  }}
                  className={`flex cursor-pointer gap-3 rounded-md border px-4 py-3 ${
                    isSelected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-paper"
                  }`}
                >
                  <span className="w-5 shrink-0 font-medium text-muted">{LETTERS[i]}</span>
                  <div className="min-w-0 flex-1">
                    <RichText text={choice.text} className="text-[16px]" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">How sure are you?</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sureness">
              {SURENESS_ORDER.map((s) => (
                <button
                  key={s}
                  disabled={!selected}
                  aria-pressed={item.sureness === s}
                  title={MEANING[s]}
                  onClick={() => void setSureness(attemptId, index, s, getElapsed())}
                  className={`btn ${item.sureness === s ? "border-accent bg-accent text-white hover:bg-accent/90" : ""}`}
                >
                  {SURENESS_LABEL[s]}
                  <span className="ml-1 text-xs opacity-60">{KEY_FOR[s]}</span>
                </button>
              ))}
            </div>
            {!selected && (
              <p className="mt-1 text-xs text-muted">
                Pick a choice first. The keys A to {LETTERS[item.choiceOrder.length - 1]} also pick.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {onPrev && (
              <button className="btn" onClick={onPrev}>
                Previous
              </button>
            )}
            <button className="btn btn-primary" disabled={!complete} onClick={() => void confirm()}>
              {confirmLabel}
              <span className="ml-1 text-xs opacity-70">Enter</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}