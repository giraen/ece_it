import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { now } from "@/lib/ids";

/**
 * Finding questions or memory cards that may have been added twice.
 *
 * Two texts are compared by their words: how many words they share, and how many pairs of neighbouring words they
 * share, so the same words in another order count for less. The two are averaged into one percentage. Capitals,
 * spacing and LaTeX braces do not count; numbers, units and symbols do, so "a < b" and "a = b" differ.
 */

/** The words of a text, for comparing. Pictures, $ signs and braces are left out. */
export function words(text: string): string[] {
  return (
    text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .toLowerCase()
      .replace(/\\(left|right|,|;|!|quad)/g, " ")
      .match(/\\?[a-z]+|\d+(?:[.,]\d+)?|[^\s\w${}\\()[\],.;:?!'"`]/g) ?? []
  );
}

function bag(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

/** A text ready to compare many times over. */
export interface Prepared {
  words: string[];
  one: Map<string, number>;
  two: Map<string, number>;
}

export function prepare(text: string): Prepared {
  const w = words(text);
  const pairs: string[] = [];
  for (let i = 1; i < w.length; i++) pairs.push(`${w[i - 1]} ${w[i]}`);
  return { words: w, one: bag(w), two: bag(pairs) };
}

function shared(a: Map<string, number>, b: Map<string, number>): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const [k, c] of small) n += Math.min(c, big.get(k) ?? 0);
  return n;
}

const dice = (common: number, a: number, b: number) => (a + b === 0 ? 1 : (2 * common) / (a + b));

/** How alike two texts are, from 0 to 1. */
export function similarity(a: Prepared, b: Prepared): number {
  const la = a.words.length;
  const lb = b.words.length;
  if (!la || !lb) return la === lb ? 1 : 0;
  const one = dice(shared(a.one, b.one), la, lb);
  // A one-word text has no word pairs, so its words alone decide.
  if (la < 2 || lb < 2) return one;
  const two = dice(shared(a.two, b.two), la - 1, lb - 1);
  return (one + two) / 2;
}

/** The most two texts of these lengths could share: used to skip pairs that cannot reach the minimum. */
function bestPossible(la: number, lb: number): number {
  const one = dice(Math.min(la, lb), la, lb);
  const two = la < 2 || lb < 2 ? one : dice(Math.min(la, lb) - 1, la - 1, lb - 1);
  return (one + two) / 2;
}

/** The same text: equal once capitals, spacing and a closing full stop are set aside. Symbols still count. */
export function sameText(a: string, b: string): boolean {
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.?!:;,]+$/, "");
  const x = key(a);
  return x.length > 0 && x === key(b);
}

export interface Pair {
  a: string;
  b: string;
  /** How alike, from 0 to 1. */
  score: number;
  /** Exactly the same wording. */
  same: boolean;
}

/**
 * Pairs of items in the same group (a category, or a deck) that are at least `min` alike, most alike first.
 * `groups` gives each item the groups it is in; two items are compared when they share one.
 */
export function findPairs(items: { id: string; text: string; groups: string[] }[], min: number, limit = 300): Pair[] {
  const prepared = new Map(items.map((it) => [it.id, prepare(it.text)]));
  const text = new Map(items.map((it) => [it.id, it.text]));
  const byGroup = new Map<string, string[]>();
  for (const it of items) for (const g of it.groups) byGroup.set(g, [...(byGroup.get(g) ?? []), it.id]);
  const seen = new Set<string>();
  const out: Pair[] = [];
  for (const ids of byGroup.values()) {
    // Sorted by length, so once the next item is too long to reach the minimum, the rest are too.
    const list = [...ids].sort((x, y) => prepared.get(x)!.words.length - prepared.get(y)!.words.length);
    for (let i = 0; i < list.length; i++) {
      const pa = prepared.get(list[i])!;
      for (let j = i + 1; j < list.length; j++) {
        const pb = prepared.get(list[j])!;
        if (bestPossible(pa.words.length, pb.words.length) < min) break;
        const key = pairKey(list[i], list[j]);
        if (seen.has(key)) continue;
        seen.add(key);
        const same = sameText(text.get(list[i])!, text.get(list[j])!);
        const score = same ? 1 : similarity(pa, pb);
        if (score >= min) out.push({ a: list[i], b: list[j], score, same });
      }
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}

/** The same key for a pair whichever way round it is given. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The words of two texts, each marked when the other text does not have it at that place, to show what differs.
 * It works on the words as written, so it is only used for text without maths or pictures.
 */
export function wordDiff(
  a: string,
  b: string,
): { a: { text: string; changed: boolean }[]; b: { text: string; changed: boolean }[] } {
  const wa = a.split(/(\s+)/).filter((x) => x !== "");
  const wb = b.split(/(\s+)/).filter((x) => x !== "");
  // Capitals and punctuation at either end do not count, so "approximately" and "approximately." match.
  const key = (w: string) => w.toLowerCase().replace(/^[("'\[]+|[.,;:?!)"'\]]+$/g, "");
  // The longest run of words the two share, in order.
  const n = wa.length;
  const m = wb.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = key(wa[i]) === key(wb[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Array<boolean>(n).fill(false);
  const keepB = new Array<boolean>(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (key(wa[i]) === key(wb[j])) {
      keepA[i++] = true;
      keepB[j++] = true;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const mark = (list: string[], keep: boolean[]) =>
    list.map((text, i) => ({ text, changed: !keep[i] && text.trim() !== "" }));
  return { a: mark(wa, keepA), b: mark(wb, keepB) };
}

/** Text that shows as plain words, so its differences can be marked word by word. */
export const plainText = (s: string) => !/[$\\]|!\[|\*\*|`/.test(s);

// ---------------------------------------------------------------------------------------------
// Pairs you have said are different, kept with your settings so they sync
// ---------------------------------------------------------------------------------------------

const KEY = "duplicatesDifferent";

export async function loadDifferent(): Promise<Set<string>> {
  const row = await db.settings.get(KEY);
  const v = row && !row.deletedAt ? row.value : [];
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
}

export function useDifferent(): Set<string> | undefined {
  return useLiveQuery(() => loadDifferent(), []);
}

/** Marks a pair as different (they stop showing), or takes the mark off. */
export async function setDifferent(key: string, different: boolean): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const cur = await loadDifferent();
    if (different) cur.add(key);
    else cur.delete(key);
    await db.settings.put({ id: KEY, value: [...cur], updatedAt: now() });
  });
}
