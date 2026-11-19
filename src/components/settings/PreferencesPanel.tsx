"use client";

import { useState } from "react";
import { CONFIG } from "@/lib/config";
import { MASTERY_BAR_MAX, MASTERY_BAR_MIN, cleanMasteryBar, saveMasteryBar, useMasteryBar } from "@/lib/preferences";
import { setFullMotion, useFullMotion } from "@/lib/ui/motion";
import { syncRules } from "@/lib/progress/recheck";
import InfoTip from "@/components/ui/InfoTip";
import { useReadOnly } from "@/lib/sync/syncState";
import { saveExam, useExam } from "@/lib/memory/exam";
import { examPlan } from "@/lib/memory/schedule";
import { suggestCounts, useMemory } from "@/lib/memory/review";
import { saveCoverChoices, useCoverChoices } from "@/lib/quiz/cover";
import { useNow } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import {
  DAILY_MAX,
  DAILY_MIN,
  START_MAX,
  START_MIN,
  saveDailySize,
  saveStartCards,
  useDailySize,
  useStartCards,
} from "@/lib/memory/daily";
import { IncognitoNote, IncognitoSwitch } from "@/components/ui/Incognito";

/** Whether the choices of solving problems start covered in quizzes. */
function CoverSetting({ readOnly }: { readOnly: boolean }) {
  const on = useCoverChoices();
  return (
    <div className="flex items-center gap-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={on ?? true}
          disabled={readOnly || on === undefined}
          onChange={(e) => void saveCoverChoices(e.target.checked)}
        />
        Cover the choices on solving problems
      </label>
      <InfoTip>
        In quizzes and mock boards, a solving problem starts with its choices covered. Work the answer out, then press
        Show choices (or Space) and pick. Computation questions and questions whose choices are all numbers or formulas
        count as solving problems; any question can be set to always or never cover in the editor. Turning this off
        affects quizzes started after.
        {readOnly ? " Set on your main device." : ""}
      </InfoTip>
    </div>
  );
}

/** A whole number setting, saved when you leave the box or press Enter. */
function NumberSetting({
  id,
  label,
  tip,
  unit,
  value,
  min,
  max,
  save,
  readOnly,
  suggestion,
}: {
  id: string;
  label: string;
  tip: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  save: (n: number) => Promise<unknown>;
  readOnly: boolean;
  /** A number worked out from the exam date, and why; "no-exam" when there is no date to work from. */
  suggestion?: { value: number; why: string } | "no-exam" | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === undefined ? "" : String(value));
  const n = Number(shown);
  const valid = shown !== "" && Number.isInteger(n) && n >= min && n <= max;
  const commit = async () => {
    if (text === null) return;
    if (valid) await save(n);
    setText(null);
  };
  return (
    <div id={id} className="space-y-2">
      <div className="flex items-center gap-1">
        <label htmlFor={`${id}-size`} className="text-sm font-medium">
          {label}
        </label>
        <InfoTip>{tip}</InfoTip>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-size`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          className="input w-24"
          disabled={readOnly}
          aria-invalid={!valid}
          aria-describedby={`${id}-help`}
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
          }}
        />
        <span className="text-sm text-muted">{unit}</span>
      </div>
      <p id={`${id}-help`} className={`text-sm ${valid ? "text-muted" : "text-danger"}`}>
        {valid
          ? `At least ${min}, at most ${max}.`
          : `Give a whole number from ${min} to ${max}. Leaving it keeps ${value ?? min}.`}
        {readOnly && " Set on your main device."}
      </p>
      {suggestion === "no-exam" && (
        <p className="text-sm text-muted">Set the board exam below to get a suggested number.</p>
      )}
      {suggestion && suggestion !== "no-exam" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-paper px-3 py-2 text-sm">
          <span>
            Suggested: <span className="num font-semibold">{suggestion.value}</span>
            <span className="text-muted"> · {suggestion.why}</span>
          </span>
          {value === suggestion.value ? (
            <span className="text-good">In use</span>
          ) : (
            <button
              type="button"
              className="btn py-1"
              disabled={readOnly}
              onClick={() => {
                setText(null);
                void save(suggestion.value);
              }}
            >
              Use {suggestion.value}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** How many cards the daily review asks for, and how many each deck opens with. */
function MemoryNumbers({ readOnly }: { readOnly: boolean }) {
  const daily = useDailySize();
  const start = useStartCards();
  const data = useMemory();
  const nowMs = useNow();
  const exam = useExam();
  const hint = data ? suggestCounts(data, nowMs) : undefined;
  // No exam, or nothing left to open: there is nothing to work a suggestion out from.
  const noExam = exam !== undefined && !exam.month && !exam.date;
  const by = data?.exam ? formatDate(data.exam.allSeenBy) : "";
  const startHint = noExam
    ? ("no-exam" as const)
    : hint && {
        value: hint.start,
        why: `${hint.locked} cards are still to open by ${by}, ${hint.daysLeft} days away. The fullest deck needs about ${hint.perWeek} a week to keep pace; this adds 25% to stay ahead, rounded up to a multiple of 5. The exam pace opens the rest each day.`,
      };
  const dailyHint = noExam
    ? ("no-exam" as const)
    : hint && {
        value: hint.daily,
        why: `About ${hint.newPerDay} new card${hint.newPerDay === 1 ? "" : "s"} a day open to keep pace, and each comes back about five times in its first two months: about ${hint.dailyNeed} a day. This adds 25% for more recall, rounded up to a multiple of 5.`,
      };
  return (
    <>
      <NumberSetting
        id="daily"
        label="Daily review"
        unit="cards a day"
        tip="The daily review on Activity mixes every deck. Everything due comes first; when that is fewer than your goal, cards due soon fill it up. Answering those early never moves them up a box, but a miss sends one back to box 1. Cards answered in any review today count toward the goal."
        value={daily}
        min={DAILY_MIN}
        max={DAILY_MAX}
        save={saveDailySize}
        readOnly={readOnly}
        suggestion={dailyHint}
      />
      <NumberSetting
        id="start-cards"
        label="New cards per deck"
        unit="cards to start each deck"
        tip="How many cards each memory deck opens with. After that, every card you get to box 3 opens one more, so the more you remember, the more you see. Raising it opens more cards at your next review. Lowering it never locks a card you already have."
        value={start}
        min={START_MIN}
        max={START_MAX}
        save={saveStartCards}
        readOnly={readOnly}
        suggestion={startHint}
      />
    </>
  );
}

export default function PreferencesPanel() {
  const bar = useMasteryBar();
  const fullMotion = useFullMotion();
  // The bar is shared by every device and set on the main one.
  const readOnly = useReadOnly();
  const exam = useExam();
  const plan = exam ? examPlan(exam.month, exam.date) : null;
  const saved = Math.round(bar * 100);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(saved);
  const valid = cleanMasteryBar(shown) !== null;

  async function commit() {
    if (text === null) return;
    if (cleanMasteryBar(text) !== null) {
      await saveMasteryBar(text);
      setText(null);
      // Quizzes still counting toward mastery are judged again by the new bar.
      void syncRules();
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <label htmlFor="mastery-bar" className="text-sm font-medium">
              Mastery bar
            </label>
            <InfoTip>
              A quiz passes, and can award mastery, when its average credit reaches this bar. When you change it, the
              quizzes whose mastery could still be running are rechecked against the new bar. The graph on the Analytics
              tab shows this bar as a dashed green line, and the {Math.round(CONFIG.minimumPass * 100)}% minimum to pass
              as a fixed red line.
            </InfoTip>
          </span>
          <input
            id="mastery-bar"
            type="number"
            min={MASTERY_BAR_MIN}
            max={MASTERY_BAR_MAX}
            step={1}
            className="input w-24"
            disabled={readOnly}
            value={shown}
            aria-invalid={!valid}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
            }}
          />
          <span className="text-sm text-muted">%</span>
          {readOnly && <span className="text-sm text-muted">Set on your main device.</span>}
        </div>
        {!valid && (
          <p role="alert" className="text-sm text-danger">
            Use a whole number from {MASTERY_BAR_MIN} to {MASTERY_BAR_MAX}. It has to be above the{" "}
            {Math.round(CONFIG.minimumPass * 100)}% minimum to pass.
          </p>
        )}
      </div>

      <MemoryNumbers readOnly={readOnly} />

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium">Board exam</p>
          <InfoTip>
            Memory uses this to pace new cards, so every card has come up at least three weeks before the exam. Give the
            month you expect it in, and the exact date once it is announced. Memory plans for whichever comes first, so
            it is never late. Leave both empty to unlock new cards only as you remember the ones you have.
          </InfoTip>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted">Expected month</span>
            <input
              type="month"
              className="input w-44"
              disabled={readOnly}
              value={exam?.month ?? ""}
              onChange={(e) => void saveExam("month", e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted">Exact date</span>
            <input
              type="date"
              className="input w-44"
              disabled={readOnly}
              value={exam?.date ?? ""}
              onChange={(e) => void saveExam("date", e.target.value)}
            />
          </label>
        </div>
        <p className="text-sm text-muted">
          {plan
            ? `Planning for ${formatDate(plan.target)}: every memory card comes up by ${formatDate(plan.allSeenBy)}.`
            : "Not set."}
          {readOnly && " Set on your main device."}
        </p>
      </div>

      <CoverSetting readOnly={readOnly} />

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <IncognitoSwitch />
          <InfoTip>
            For a quiz or review you do not want counted, such as a warm-up or someone else using this device. While it
            is on, a quiz is not saved with your quizzes and a memory review moves no card. Nothing counts toward
            mastery, locks, analytics, or memory boxes, and nothing syncs. It stays on until you turn it off, and only
            on this device. The same switch is on the Quiz and Activity pages.
          </InfoTip>
        </div>
        <IncognitoNote what="both" />
      </div>

      <div className="flex items-center gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={fullMotion} onChange={(e) => setFullMotion(e.target.checked)} />
          Always play animations
        </label>
        <InfoTip>
          If your computer is set to reduce motion, this app plays no animation, so the chart lines and sliding cards do
          not move. Turn this on to play them anyway. It is saved in this browser.
        </InfoTip>
      </div>
    </div>
  );
}
