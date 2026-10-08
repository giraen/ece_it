"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Concept, TreeNode } from "@/lib/db";
import { deleteConcept, saveConcept, titleFrom } from "@/lib/concepts";
import { useTagSuggestions } from "@/lib/hooks";
import { newId, now } from "@/lib/ids";
import DraftReview from "./DraftReview";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import TagInput from "./TagInput";
import TopicPicker from "./TopicPicker";
import InfoTip from "./InfoTip";

interface Props {
  /** The concept being edited, or null for a new one. */
  initial: Concept | null;
  defaultTopicId: string | null;
  nodes: TreeNode[];
}

export default function ConceptEditor({ initial, defaultTopicId, nodes }: Props) {
  const router = useRouter();
  const [topicId, setTopicId] = useState<string | null>(initial?.topicId ?? defaultTopicId);
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const suggestions = useTagSuggestions(topicId);

  const edited = () => setSaved(false);

  async function save() {
    const problems: string[] = [];
    if (!topicId) problems.push("Pick a category, subject, and topic.");
    if (!body.trim()) problems.push("Write the explanation.");
    setErrors(problems);
    if (problems.length || !topicId) return;
    setSaving(true);
    try {
      const t = now();
      const id = initial?.id ?? newId();
      await saveConcept({
        id,
        topicId,
        title: titleFrom(body.trim()),
        body: body.trim(),
        tags,
        createdAt: initial?.createdAt ?? t,
        updatedAt: t,
      });
      // After the first save the address names the concept, so a refresh or a bookmark opens it.
      if (!initial) router.replace(`/concept?id=${id}`);
      else setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!window.confirm("Delete this concept?")) return;
    await deleteConcept(initial.id);
    router.push(`/bank?node=${initial.topicId}&tab=concepts`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">{initial ? "Edit concept" : "New concept"}</h1>
        <p className="text-sm text-muted">
          A concept is a short note on one idea, such as crosstalk. Write it in your own words, so you can read it
          before a quiz. The first line becomes its name in the list.
        </p>

        <TopicPicker nodes={nodes} value={topicId} onChange={(id) => (setTopicId(id), edited())} />

        <div>
          <label className="mb-1 block text-sm font-medium">Explanation</label>
          <ImageTextarea
            label="Explanation"
            value={body}
            onChange={(v) => {
              setBody(v);
              edited();
            }}
            rows={10}
            placeholder="Explain it in your own words. Use $...$ for maths, and paste a figure if it helps."
          />
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-sm font-medium">Tags</label>
            <InfoTip>Optional. Tags help you find the note when you search the Bank.</InfoTip>
          </div>
          <TagInput
            value={tags}
            onChange={(t) => {
              setTags(t);
              edited();
            }}
            suggestions={suggestions}
          />
        </div>

        {errors.length > 0 && (
          <ul className="list-disc rounded-md border border-danger/40 bg-danger/5 py-2 pr-3 pl-7 text-sm text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {saved && <p className="text-sm text-good">Saved.</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            Save concept
          </button>
          <Link href={topicId ? `/bank?node=${topicId}&tab=concepts` : "/bank?tab=concepts"} className="btn">
            Back to the bank
          </Link>
          {initial && (
            <button className="btn btn-danger ml-auto" onClick={() => void remove()}>
              Delete concept
            </button>
          )}
        </div>

        {initial ? (
          <DraftReview concept={initial} />
        ) : (
          <p className="text-sm text-muted">Save the concept first. Then you can draft questions from it.</p>
        )}
      </div>

      <aside aria-label="Preview">
        <div className="sticky top-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Preview</h2>
          <article className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
            {body.trim() ? (
              <RichText text={body} className="text-[15px] leading-relaxed" />
            ) : (
              <p className="text-sm text-muted">The explanation appears here as you type.</p>
            )}
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1" aria-label="Tags">
                {tags.map((t) => (
                  <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </article>
        </div>
      </aside>
    </div>
  );
}