"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Choice, Question, TreeNode } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { useTopicTags } from "@/lib/hooks";
import { deleteQuestions, normalizeTags, saveQuestion } from "@/lib/questions";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import TagInput from "./TagInput";
import TopicPicker from "./TopicPicker";

function blankChoices(): Choice[] {
  return Array.from({ length: 4 }, () => ({ id: newId(), text: "" }));
}

const letter = (i: number) => String.fromCharCode(65 + i);

interface Props {
  initial: Question | null;
  defaultTopicId: string | null;
  nodes: TreeNode[];
}

export default function QuestionEditor({ initial, defaultTopicId, nodes }: Props) {
  const router = useRouter();
  const [topicId, setTopicId] = useState<string | null>(initial?.topicId ?? defaultTopicId);
  const [stem, setStem] = useState(initial?.stem ?? "");
  const [choices, setChoices] = useState<Choice[]>(() => initial?.choices ?? blankChoices());
  const [correctId, setCorrectId] = useState<string | null>(initial?.correctChoiceId ?? null);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [difficulty, setDifficulty] = useState(initial?.difficulty?.toString() ?? "");
  const [targetSec, setTargetSec] = useState(initial?.targetSec?.toString() ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const topicTags = useTopicTags(topicId);

  function setChoiceText(id: string, text: string) {
    setChoices((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)));
  }

  function removeChoice(id: string) {
    setChoices((cs) => cs.filter((c) => c.id !== id));
    if (correctId === id) setCorrectId(null);
  }

  async function save(andAnother: boolean) {
    const filled = choices.filter((c) => c.text.trim());
    const problems: string[] = [];
    if (!topicId) problems.push("Pick a category, subject, and topic.");
    if (!stem.trim()) problems.push("Write the question.");
    if (filled.length < 2) problems.push("Add at least two choices.");
    if (!correctId || !filled.some((c) => c.id === correctId)) {
      problems.push("Mark one filled-in choice as correct.");
    }
    const diff = difficulty.trim() === "" ? undefined : Number(difficulty);
    if (diff !== undefined && (!Number.isInteger(diff) || diff < 1 || diff > 5)) {
      problems.push("Difficulty must be a whole number from 1 to 5, or left blank.");
    }
    const target = targetSec.trim() === "" ? undefined : Number(targetSec);
    if (target !== undefined && (!Number.isFinite(target) || target <= 0)) {
      problems.push("Target time must be a positive number of seconds, or left blank.");
    }
    setErrors(problems);
    if (problems.length || !topicId || !correctId) return;

    setSaving(true);
    try {
      const t = now();
      await saveQuestion({
        id: initial?.id ?? newId(),
        topicId,
        type: "standard",
        stem: stem.trim(),
        choices: filled,
        correctChoiceId: correctId,
        tags: normalizeTags(tags),
        difficulty: diff,
        targetSec: target === undefined ? undefined : Math.round(target),
        createdAt: initial?.createdAt ?? t,
        updatedAt: t,
      });
      if (andAnother) {
        setStem("");
        setChoices(blankChoices());
        setCorrectId(null);
        setNotice("Saved. Ready for the next question.");
      } else {
        router.push(`/bank?node=${topicId}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!window.confirm("Delete this question?")) return;
    await deleteQuestions([initial.id]);
    router.push(`/bank?node=${initial.topicId}`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">{initial ? "Edit question" : "New question"}</h1>

        <TopicPicker nodes={nodes} value={topicId} onChange={setTopicId} />

        <div>
          <label className="mb-1 block text-sm font-medium">Question</label>
          <ImageTextarea
            label="Question"
            value={stem}
            onChange={setStem}
            rows={5}
            placeholder="Write the question. Use $...$ for math, for example $x(t) * h(t)$."
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Choices</legend>
          <p className="mb-2 text-xs text-muted">Select the radio button next to the correct choice.</p>
          <div className="space-y-3">
            {choices.map((c, i) => (
              <div key={c.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="correct"
                  className="mt-2.5"
                  checked={correctId === c.id}
                  onChange={() => setCorrectId(c.id)}
                  aria-label={`Choice ${letter(i)} is correct`}
                />
                <span className="mt-1.5 w-5 text-sm font-medium text-muted">{letter(i)}</span>
                <div className="flex-1">
                  <ImageTextarea
                    label={`Choice ${letter(i)}`}
                    value={c.text}
                    onChange={(v) => setChoiceText(c.id, v)}
                    rows={2}
                  />
                </div>
                <button
                  type="button"
                  className="btn mt-0.5"
                  onClick={() => removeChoice(c.id)}
                  disabled={choices.length <= 2}
                  aria-label={`Remove choice ${letter(i)}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn mt-3"
            onClick={() => setChoices((cs) => [...cs, { id: newId(), text: "" }])}
          >
            Add choice
          </button>
        </fieldset>

        <div>
          <label className="mb-1 block text-sm font-medium">Tags</label>
          <TagInput value={tags} onChange={setTags} suggestions={topicTags} />
          <p className="mt-1 text-xs text-muted">
            Tags belong to this topic. You can change them later from the question bank.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium">Difficulty (1–5)</label>
            <input
              className="input"
              inputMode="numeric"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium">Target time (s)</label>
            <input
              className="input"
              inputMode="numeric"
              value={targetSec}
              onChange={(e) => setTargetSec(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="list-disc rounded-md border border-danger/40 bg-danger/5 py-2 pr-3 pl-7 text-sm text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {notice && <p className="text-sm text-good">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving} onClick={() => void save(false)}>
            Save question
          </button>
          {!initial && (
            <button className="btn" disabled={saving} onClick={() => void save(true)}>
              Save and add another
            </button>
          )}
          <Link href={topicId ? `/bank?node=${topicId}` : "/bank"} className="btn">
            Cancel
          </Link>
          {initial && (
            <button className="btn btn-danger ml-auto" onClick={() => void remove()}>
              Delete question
            </button>
          )}
        </div>
      </div>

      <aside aria-label="Preview">
        <div className="sticky top-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Preview</h2>
          <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
            {stem.trim() ? (
              <RichText text={stem} className="text-[15px] leading-relaxed" />
            ) : (
              <p className="text-sm text-muted">The question appears here as you type.</p>
            )}
            <ol className="mt-4 space-y-2">
              {choices.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex gap-3 rounded-md border px-3 py-2 ${
                    correctId === c.id ? "border-good bg-good/5" : "border-line"
                  }`}
                >
                  <span className="w-5 shrink-0 font-medium text-muted">{letter(i)}</span>
                  <div className="min-w-0 flex-1">
                    {c.text.trim() ? (
                      <RichText text={c.text} className="text-[15px]" />
                    ) : (
                      <span className="text-sm text-muted">Empty</span>
                    )}
                  </div>
                  {correctId === c.id && <span className="text-xs font-medium text-good">Correct</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
}
