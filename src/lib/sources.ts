import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { newId, now } from "./ids";

/** A book, website or set of notes that questions and concepts come from. Kept once, picked many times. */
export interface Source {
  id: string;
  kind: "book" | "website" | "notes" | "other";
  title: string;
  authors: string;
  edition: string;
  year: string;
  publisher: string;
  url: string;
  createdAt: number;
}

export const SOURCE_KINDS: { kind: Source["kind"]; label: string; where: string }[] = [
  { kind: "book", label: "Book", where: "p. 143, Problem 5" },
  { kind: "website", label: "Website", where: "section or heading" },
  { kind: "notes", label: "Notes or lecture", where: "slide 12, week 3" },
  { kind: "other", label: "Other", where: "page, number, or section" },
];

const KEY = "sources";
const LAST = "ece:lastSource";

function clean(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Source).id === "string")
    .map((s) => ({
      id: String(s.id),
      kind: (["book", "website", "notes", "other"] as const).includes(s.kind as Source["kind"])
        ? (s.kind as Source["kind"])
        : "other",
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
  const w = where.trim();
  return w ? `${label}, ${w}` : label;
}

/**
 * Splits a stored reference back into a saved source and the "where" part, when it starts with one of their labels.
 * The longest matching label wins, so two sources with similar names do not get mixed up.
 */
export function splitReference(reference: string, sources: Source[]): { source: Source | null; where: string } {
  const text = reference.trim();
  let best: { source: Source; label: string } | null = null;
  for (const s of sources) {
    const label = sourceLabel(s);
    if (!label) continue;
    if ((text === label || text.startsWith(label + ", ")) && (!best || label.length > best.label.length)) {
      best = { source: s, label };
    }
  }
  if (!best) return { source: null, where: "" };
  return { source: best.source, where: text.slice(best.label.length).replace(/^,\s*/, "") };
}

/** The source part of a reference, with the page or problem removed. A reference typed by hand is left as it is. */
export function keepSourceOnly(reference: string, sources: Source[]): string {
  const { source } = splitReference(reference, sources);
  return source ? sourceLabel(source) : reference;
}

/** Remembers which source was used last, so the next new question or note can start with it. */
export async function rememberReference(reference: string): Promise<void> {
  try {
    const { source } = splitReference(reference, await loadSources());
    if (source) localStorage.setItem(LAST, sourceLabel(source));
  } catch {
    // storage can be blocked; the default simply will not be remembered
  }
}

/** The source label used last, or an empty string. */
export function lastSourceLabel(): string {
  try {
    return typeof window === "undefined" ? "" : (localStorage.getItem(LAST) ?? "");
  } catch {
    return "";
  }
}