"use client";

import { useState } from "react";
import Link from "next/link";
import type { Choice, TreeNode } from "@/lib/db";
import { newId } from "@/lib/ids";
import { categoriesOf } from "@/lib/tree";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import TopicPicker from "./TopicPicker";

const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

const letter = (i: number) => String.fromCharCode(65 + i);

function blankChoices(): Choice[] {
  return Array.from({ length: 4 }, () => ({ id: newId(), text: "" }));
}

interface Props {
  defaultTopicId: string | null;
  nodes: TreeNode[];
}

/** "ELEX / MATH › EM Theory › Crosstalk". A shared subject lists every category it belongs to. */
function describe(nodes: TreeNode[], topicId: string): string {
  const topic = nodes.find((n) => n.id === topicId);
  const subject = topic?.parentId ? nodes.find((n) => n.id === topic.parentId) : undefined;
  if (!topic || !subject) return topic?.name ?? "";
  const cats = categoriesOf(subject)
    .map((id) => nodes.find((n) => n.id === id)?.name)
    .filter(Boolean)
    .join(" / ");
  return `${cats} › ${subject.name} › ${topic.name}`;
}

export default function QuestionEditor({ defaultTopicId, nodes }: Props) {
  const [topicId, setTopicId] = useState<string | null>(defaultTopicId);
  const [stem, setStem] = useState("");
  const [choices, setChoices] = useState<Choice[]>(blankChoices);
  const [correctId, setCorrectId] = useState<string | null>(null);

  function setChoiceText(id: string, text: string) {
    setChoices((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)));
  }

  function removeChoice(id: string) {
    setChoices((cs) => cs.filter((c) => c.id !== id));
    // If the correct choice was removed, nothing is marked correct until you pick again.
    setCorrectId((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">New question</h1>

        <TopicPicker nodes={nodes} value={topicId} onChange={setTopicId} />

        <p className="text-sm text-muted">
          {topicId ? (
            <>
              Filed under <strong className="text-ink">{describe(nodes, topicId)}</strong>
            </>
          ) : (
            "Choose a category, a subject, and a topic."
          )}
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium">Question</label>
          <ImageTextarea
            label="Question"
            value={stem}
            onChange={setStem}
            rows={6}
            placeholder="Write the question. Use $...$ for maths, and paste or drop a picture."
          />
          <p className="mt-1 text-xs text-muted">
            Maths goes between dollar signs, like $x^2$. For a centered formula, put $$ on its own line above and below it.
          </p>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Choices</legend>
          <p className="mb-2 text-xs text-muted">Select the round button next to the correct choice.</p>
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
                  <ImageTextarea label={`Choice ${letter(i)}`} value={c.text} onChange={(v) => setChoiceText(c.id, v)} rows={2} />
                </div>
                <button
                  type="button"
                  className="btn mt-0.5"
                  onClick={() => removeChoice(c.id)}
                  disabled={choices.length <= MIN_CHOICES}
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
            disabled={choices.length >= MAX_CHOICES}
            onClick={() => setChoices((cs) => [...cs, { id: newId(), text: "" }])}
          >
            Add choice
          </button>
        </fieldset>

        <Link href="/bank" className="btn">
          Back to the bank
        </Link>
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