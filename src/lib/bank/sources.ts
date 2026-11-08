import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { newId, now } from "./ids";

/**
 * A past quiz, book, website or video that questions and concepts come from, or any other kind of source, such as
 * notes or a handout. Kept once, picked many times.
 */
export interface Source {
  id: string;
  kind: "quiz" | "book" | "website" | "video" | "other";
  title: string;
  authors: string;
  edition: string;
  year: string;
  publisher: string;
  url: string;
  createdAt: number;
}

/** The kinds a source can be made as, in the order they are listed. */
export const SOURCE_KINDS: { kind: Source["kind"]; label: string; plural: string }[] = [
  { kind: "quiz", label: "Past quiz", plural: "Past quizzes" },
  { kind: "book", label: "Book", plural: "Books" },
  { kind: "website", label: "Website", plural: "Websites" },
  { kind: "video", label: "Video", plural: "Videos" },
  { kind: "other", label: "Other", plural: "Others" },
];

/** Every kind with its names, so a saved source always has a heading. */
export const KIND_NAMES: Record<Source["kind"], { label: string; plural: string }> = {
  quiz: { label: "Past quiz", plural: "Past quizzes" },
  book: { label: "Book", plural: "Books" },
  website: { label: "Website", plural: "Websites" },
  video: { label: "Video", plural: "Videos" },
  other: { label: "Other", plural: "Others" },
};

const KINDS: Source["kind"][] = ["quiz", "book", "website", "video", "other"];

const KEY = "sources";

function clean(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Source).id === "string")
    .map((s) => ({
      id: String(s.id),
      // Notes and anything unknown from before become "other".
      kind: KINDS.includes(s.kind as Source["kind"]) ? (s.kind as Source["kind"]) : "other",
      title: str(s.title),
      authors: str(s.authors),
      edition: str(s.edition),
      year: str(s.year),
      publisher: str(s.publisher),
      url: str(s.url),
      createdAt: typeof s.createdAt === "number" ? s.createdAt : 0,
    }))
    .filter((s) => s.title);
}

/** How a source reads in a reference: "Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson". */
export function sourceLabel(s: Pick<Source, "title" | "authors" | "edition" | "year" | "publisher" | "url">): string {
  const head = [s.authors, s.title, s.edition]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
  const year = s.year.trim() ? ` (${s.year.trim()})` : "";
  return [head + year, s.publisher.trim(), s.url.trim()].filter((x) => x.trim()).join(", ");
}

export async function loadSources(): Promise<Source[]> {
  const row = await db.settings.get(KEY);
  return row && !row.deletedAt ? clean(row.value) : [];
}

export function useSources(): Source[] | undefined {
  return useLiveQuery(() => loadSources(), []);
}

async function write(list: Source[]): Promise<void> {
  await db.settings.put({ id: KEY, value: list, updatedAt: now() });
}

/** Adds a source, or changes the one with the same id. Returns the saved source. */
export async function saveSource(input: Omit<Source, "id" | "createdAt"> & { id?: string }): Promise<Source> {
  return db.transaction("rw", db.settings, async () => {
    const list = await loadSources();
    const existing = input.id ? list.find((s) => s.id === input.id) : undefined;
    const saved: Source = {
      ...input,
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now(),
    };
    await write(existing ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved]);
    return saved;
  });
}

export async function deleteSource(id: string): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    await write((await loadSources()).filter((s) => s.id !== id));
  });
}

/** "label, where" or just "label" when `where` is empty. */
export function joinReference(label: string, where: string): string {
  // Spaces inside and after the text are kept, so a space can be typed. The editors trim the whole reference when saving.
  return where.trim() ? `${label}, ${where.replace(/^\s+/, "")}` : label;
}

/**
 * Splits a stored reference back into a saved source and the "where" part, when it starts with one of their labels.
 * The longest matching label wins, so two sources with similar names do not get mixed up.
 */
export function splitReference(reference: string, sources: Source[]): { source: Source | null; where: string } {
  const text = reference.replace(/^\s+/, "");
  let best: { source: Source; label: string } | null = null;
  for (const s of sources) {
    const label = sourceLabel(s);
    if (!label) continue;
    if ((text.trimEnd() === label || text.startsWith(label + ", ")) && (!best || label.length > best.label.length)) {
      best = { source: s, label };
    }
  }
  if (!best) return { source: null, where: "" };
  if (text.trimEnd() === best.label) return { source: best.source, where: "" };
  return { source: best.source, where: text.slice(best.label.length).replace(/^,\s*/, "") };
}

/** The source part of a reference, with the page or problem removed. A reference typed by hand is left as it is. */
export function keepSourceOnly(reference: string, sources: Source[]): string {
  const { source } = splitReference(reference, sources);
  return source ? sourceLabel(source) : reference;
}

/** True when a stored reference belongs to this source, using the longest matching label so similar names stay apart. */
function usesSource(reference: string | undefined, source: Source, all: Source[]): boolean {
  return !!reference && splitReference(reference, all).source?.id === source.id;
}

/** How many questions use each saved source, by its id. */
export function countSourceUse(references: (string | undefined)[], sources: Source[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of references) {
    if (!r) continue;
    const id = splitReference(r, sources).source?.id;
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** How many questions use each saved source, kept up to date. Undefined while the first read happens. */
export function useSourceUse(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const [sources, questions] = await Promise.all([loadSources(), db.questions.filter((q) => !q.deletedAt).toArray()]);
    return countSourceUse(
      questions.map((q) => q.reference),
      sources,
    );
  }, []);
}

/** Swaps the start of a reference, keeping the page or problem that follows it. */
function swapLabel(reference: string, from: string, to: string): string {
  const text = reference.replace(/^\s+/, "");
  return to + text.slice(from.length);
}

/**
 * Gives every question, note and waiting question that uses `source` the new label, keeping the page or problem.
 * Returns how many were changed. Quizzes already taken keep the text they were shown with.
 */
async function relabel(source: Source, all: Source[], to: string): Promise<number> {
  const from = sourceLabel(source);
  if (from === to) return 0;
  const stamp = now();
  let changed = 0;
  const questions = await db.questions.filter((q) => !q.deletedAt && usesSource(q.reference, source, all)).toArray();
  for (const q of questions) {
    await db.questions.update(q.id, { reference: swapLabel(q.reference!, from, to), updatedAt: stamp });
    changed += 1;
  }
  const concepts = await db.concepts.filter((c) => !c.deletedAt && usesSource(c.reference, source, all)).toArray();
  for (const c of concepts) {
    await db.concepts.update(c.id, { reference: swapLabel(c.reference!, from, to), updatedAt: stamp });
    changed += 1;
  }
  const drafts = await db.drafts
    .filter((d) => !d.deletedAt && d.status === "pending" && usesSource(d.reference, source, all))
    .toArray();
  for (const d of drafts) {
    await db.drafts.update(d.id, { reference: swapLabel(d.reference!, from, to), updatedAt: stamp });
    changed += 1;
  }
  return changed;
}

/**
 * Saves a source. When an existing source gets a new label, everything that used the old one follows it,
 * so a question never loses its source because the title was fixed. Returns the saved source and how many changed.
 */
export async function saveSourceEverywhere(
  input: Omit<Source, "id" | "createdAt"> & { id?: string },
): Promise<{ saved: Source; changed: number }> {
  return db.transaction("rw", [db.settings, db.questions, db.concepts, db.drafts], async () => {
    const list = await loadSources();
    const existing = input.id ? list.find((s) => s.id === input.id) : undefined;
    const saved: Source = { ...input, id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? now() };
    const changed = existing ? await relabel(existing, list, sourceLabel(saved)) : 0;
    await write(existing ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved]);
    return { saved, changed };
  });
}

/** Removes a source and gives everything that used it to another source. Returns how many changed. */
export async function mergeSource(fromId: string, intoId: string): Promise<number> {
  return db.transaction("rw", [db.settings, db.questions, db.concepts, db.drafts], async () => {
    const list = await loadSources();
    const from = list.find((s) => s.id === fromId);
    const into = list.find((s) => s.id === intoId);
    if (!from || !into || from.id === into.id) return 0;
    const changed = await relabel(from, list, sourceLabel(into));
    await write(list.filter((s) => s.id !== fromId));
    return changed;
  });
}