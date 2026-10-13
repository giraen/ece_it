"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Choice, Question, TreeNode } from "@/lib/db";
import { CONFIG } from "@/lib/config";
import {
  draftFromQuestion,
  draftToQuestion,
  rollQuestion,
  validateTemplate,
  type CompDraft,
  type RollResult,
} from "@/lib/computation";
import { useTagSuggestions } from "@/lib/hooks";
import { newId, now } from "@/lib/ids";
import { deleteQuestions, normalizeTags, saveQuestion } from "@/lib/questions";
import { categoriesOf } from "@/lib/tree";
import { suggestWrongText, type Ask } from "@/lib/wrongChoices";
import ComputationEditor, { blankDraft, RollPreview } from "./ComputationEditor";
import ImageTextarea from "./ImageTextarea";
import ToolbarGroup from "./ToolbarGroup";
import Reference from "./Reference";
import ReferenceInput from "./ReferenceInput";
import { keepSourceOnly, loadSources } from "@/lib/sources";
import RichText from "./RichText";
import SuggestWrong from "./SuggestWrong";
import TagInput from "./TagInput";
import TopicPicker from "./TopicPicker";
import VariantReview from "./VariantReview";
import InfoTip from "./InfoTip";

const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

const letter = (i: number) => String.fromCharCode(65 + i);

function blankChoices(): Choice[] {
  return Array.from({ length: 4 }, () => ({ id: newId(), text: "" }));
}

interface Props {
  /** The question being edited, or null for a new one. */
  initial: Question | null;
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

const COMPUTATION_TIP =
  "New numbers every time. You write the recipe once. Each time the question appears, the app draws new numbers, works out every choice from its formula, and shows the result with units. The correct choice is always a formula, so it is right for whatever numbers were drawn.";

export default function QuestionEditor({ initial, defaultTopicId, nodes }: Props) {
  const router = useRouter();
  const [topicId, setTopicId] = useState<string | null>(initial?.topicId ?? defaultTopicId);
  const [type, setType] = useState<Question["type"]>(initial?.type ?? "standard");
  const [stem, setStem] = useState(initial?.type === "computation" ? "" : (initial?.stem ?? ""));
  const [choices, setChoices] = useState<Choice[]>(() =>
    initial && initial.type !== "computation" ? initial.choices : blankChoices(),
  );
  const [correctId, setCorrectId] = useState<string | null>(
    initial?.type === "computation" ? null : (initial?.correctChoiceId ?? null),
  );
  // A computation question is a recipe: givens, formulas, wordings, and formula choices.
  const [draft, setDraft] = useState<CompDraft>(() => (initial ? draftFromQuestion(initial) : null) ?? blankDraft());
  const [compCorrect, setCompCorrect] = useState<string | null>(
    initial?.type === "computation" ? initial.correctChoiceId : null,
  );
  const [rolled, setRolled] = useState<RollResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [repeatsText, setRepeatsText] = useState(String(initial?.repeats ?? 1));
  const [allowAi, setAllowAi] = useState(initial?.allowAi ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suggestions = useTagSuggestions(topicId);

  function setChoiceText(id: string, text: string) {
    setChoices((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)));
  }

  function removeChoice(id: string) {
    setChoices((cs) => cs.filter((c) => c.id !== id));
    // If the correct choice was removed, nothing is marked correct until you pick again.
    setCorrectId((cur) => (cur === id ? null : cur));
  }

  // The wrong choices the AI can fill in: every empty box except the correct one.
  const emptyChoices = choices.filter((c) => !c.text.trim() && c.id !== correctId);
  const correctText = choices.find((c) => c.id === correctId)?.text.trim() ?? "";
  const suggestBlock = !stem.trim()
    ? "Write the question first."
    : !correctText
      ? "Mark the correct choice and write it first."
      : emptyChoices.length === 0
        ? "Every choice is filled in. Empty the ones you want replaced."
        : null;

  async function suggestChoices(ask: Ask, count: number): Promise<number> {
    const others = choices.filter((c) => c.id !== correctId && c.text.trim()).map((c) => c.text.trim());
    const list = await suggestWrongText({ ask, stem, correct: correctText, others, count });
    setChoices((cs) => {
      let k = 0;
      return cs.map((c) => (!c.text.trim() && c.id !== correctId && k < list.length ? { ...c, text: list[k++] } : c));
    });
    return list.length;
  }

  const compQuestion = draftToQuestion(draft, compCorrect);
  const compProblems = type === "computation" ? validateTemplate(compQuestion) : [];

  function roll() {
    setChecked(true);
    setErrors([]);
    setRolled(rollQuestion(compQuestion));
  }

  async function save(andAnother: boolean) {
    const isComp = type === "computation";
    // Empty choice boxes are simply dropped. What is left must still make a question.
    const filled = choices.filter((c) => c.text.trim());
    const problems: string[] = [];
    if (!topicId) problems.push("Pick a category, subject, and topic.");
    const repeats = repeatsText.trim() === "" ? NaN : Number(repeatsText);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > CONFIG.maxRepeats)
      problems.push(`Times it can appear in one quiz must be a whole number from 1 to ${CONFIG.maxRepeats}.`);
    if (isComp) {
      setChecked(true);
      // The detailed list is shown inside the recipe editor, so only one summary line is added here.
      if (compProblems.length > 0)
        problems.push("The recipe has problems. They are listed above the “Roll a preview” button.");
      if (compProblems.length === 0) {
        // A recipe that cannot produce a question would break a quiz, so it cannot be saved.
        const check = rollQuestion(compQuestion);
        if (!check.ok) problems.push(check.reason);
      }
    } else {
      if (!stem.trim()) problems.push("Write the question.");
      if (filled.length < 2) problems.push("Add at least two choices.");
      if (!correctId || !filled.some((c) => c.id === correctId)) problems.push("Mark one filled-in choice as correct.");
    }
    setErrors(problems);
    setNotice(null);
    if (problems.length || !topicId || (!isComp && !correctId)) return;

    setSaving(true);
    try {
      const t = now();
      const stems = draft.stems.map((x) => x.trim());
      const comp = isComp
        ? {
            stem: stems[0],
            choices: compQuestion.choices.map((c) => ({ ...c, text: c.text.trim() })),
            correctChoiceId: compQuestion.correctChoiceId,
            template: { ...(compQuestion.template as NonNullable<typeof compQuestion.template>), stems },
          }
        : null;
      const { reference: _old, repeats: _oldRepeats, ...kept } = (initial ?? {}) as Partial<Question>;
      void _old;
      void _oldRepeats;
      await saveQuestion({
        ...kept, // keeps anything not edited here
        id: initial?.id ?? newId(),
        topicId,
        type,
        stem: comp ? comp.stem : stem.trim(),
        choices: comp ? comp.choices : filled.map((c) => ({ ...c, text: c.text.trim() })),
        correctChoiceId: comp ? comp.correctChoiceId : (correctId as string),
        template: comp?.template,
        tags: normalizeTags(tags),
        // Left out when it is 1, so a question that never repeats looks the same as before.
        ...(Number(repeatsText) > 1 ? { repeats: Number(repeatsText) } : {}),
        allowAi,
        createdAt: initial?.createdAt ?? t,
        updatedAt: t,
      });
      if (andAnother) {
        // The next question usually comes from the same source, but from a different page.
        setReference(keepSourceOnly(reference, await loadSources()));
        // Keep the topic, the type, and the tags, since the next question usually shares them.
        setStem("");
        setChoices(blankChoices());
        setCorrectId(null);
        setDraft(blankDraft());
        setCompCorrect(null);
        setRolled(null);
        setChecked(false);
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

        <p className="text-sm text-muted">
          {topicId ? (
            <>
              Filed under <strong className="text-ink">{describe(nodes, topicId)}</strong>
            </>
          ) : (
            "Choose a category, a subject, and a topic."
          )}
        </p>

        {!initial ? (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Type of question</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-2">
                  <input type="radio" name="qtype" checked={type === "standard"} onChange={() => setType("standard")} />
                  Standard
                </label>
                <InfoTip>Fixed question and choices.</InfoTip>
              </div>
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="qtype"
                    checked={type === "computation"}
                    onChange={() => setType("computation")}
                  />
                  Computation
                </label>
                <InfoTip>{COMPUTATION_TIP}</InfoTip>
              </div>
            </div>
          </fieldset>
        ) : (
          <div className="flex items-center gap-1 text-sm text-muted">
            {type === "computation" ? "Computation question" : "Standard question"}
            <InfoTip>{type === "computation" ? COMPUTATION_TIP : "Fixed question and choices."}</InfoTip>
          </div>
        )}

        {type === "standard" ? (
          <>
            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-sm font-medium">Question</label>
                <InfoTip>
                  Maths goes between dollar signs, like $x^2$. You can type it the quick way: $d^2/dx^2$, $sqrt(x)$,
                  $pi/2$, $int_0^1 x dx$. Subscripts with words need quotes, like $V_(&quot;out&quot;)$. Text with a
                  backslash is read as LaTeX. The buttons above the box insert these for you. For a centered formula,
                  put $$ on its own line above and below it.
                </InfoTip>
              </div>
              <ImageTextarea
                label="Question"
                value={stem}
                onChange={setStem}
                rows={6}
                placeholder="Write the question. Use $...$ for maths, and paste or drop a picture."
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Choices <InfoTip>Select the round button next to the correct choice.</InfoTip>
              </legend>
              <ToolbarGroup>
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
                        disabled={choices.length <= MIN_CHOICES}
                        aria-label={`Remove choice ${letter(i)}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </ToolbarGroup>
              <button
                type="button"
                className="btn mt-3"
                disabled={choices.length >= MAX_CHOICES}
                onClick={() => setChoices((cs) => [...cs, { id: newId(), text: "" }])}
              >
                Add choice
              </button>
              <div className="mt-3">
                <SuggestWrong blocked={suggestBlock} count={emptyChoices.length} onSuggest={suggestChoices} />
              </div>
            </fieldset>
          </>
        ) : (
          <ComputationEditor
            draft={draft}
            setDraft={setDraft}
            correctId={compCorrect}
            setCorrectId={setCompCorrect}
            problems={compProblems}
            showProblems={checked}
            onRoll={roll}
          />
        )}

        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-sm font-medium">Tags</label>
            <InfoTip>
              Optional. Tags group questions inside a topic, such as &ldquo;theorems&rdquo; or &ldquo;series
              circuits&rdquo;, and show up in your results. Press Enter or a comma to add one.
            </InfoTip>
          </div>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-sm font-medium" htmlFor="question-reference">
              Reference
            </label>
            <InfoTip>
              Optional. Where this question came from, such as a book and page or a web address. It shows in the Bank
              and when you review a quiz, never during the quiz.
            </InfoTip>
          </div>
          <ReferenceInput id="question-reference" value={reference} onChange={setReference} />
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-sm font-medium" htmlFor="question-repeats">
              Times it can appear in one quiz
            </label>
            <InfoTip>
              Usually 1. Set it higher when a question should come up more than once in a quiz, such as a computation
              question you want to practise with different numbers each time. Each time it appears counts as its own
              question, so it adds to the quiz length and to the number of questions available. Copies are spread apart,
              and a computation question gets different numbers every time. Mock boards always show a question once.
            </InfoTip>
          </div>
          <input
            id="question-repeats"
            className="input w-24"
            inputMode="numeric"
            value={repeatsText}
            onChange={(e) => setRepeatsText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allowAi} onChange={(e) => setAllowAi(e.target.checked)} />
            Allow AI to reword
          </label>
          <InfoTip>
            Lets quizzes show AI-reworded versions of this question. Each one is checked before it is used, and the
            answer never changes. Off by default. Turning it off keeps the versions already made but stops showing them.
          </InfoTip>
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
            {initial ? "Save changes" : "Save question"}
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

        {initial && <VariantReview question={initial} />}
      </div>

      <aside aria-label="Preview">
        <div className="sticky top-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Preview</h2>
          {type === "computation" ? (
            <div className="space-y-3">
              <RollPreview result={rolled} />
              <Reference text={reference} />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1" aria-label="Tags">
                  {tags.map((t) => (
                    <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
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
              <Reference text={reference} className="mt-3" />
              {tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1" aria-label="Tags">
                  {tags.map((t) => (
                    <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}