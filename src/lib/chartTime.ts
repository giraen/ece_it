import type { SeriesPoint } from "./analytics";

export type TimeAxis = "quiz" | "week" | "month";
export type Measure = "result" | "average";

const DAY = 86_400_000;

/** When the week (Monday first) or month that holds `ms` begins, in local time. */
export function periodStart(ms: number, axis: "week" | "month"): number {
  const d = new Date(ms);
  if (axis === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

/** When the next week or month begins. */
export function periodEnd(start: number, axis: "week" | "month"): number {
  const d = new Date(start);
  return axis === "month"
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime();
}

/** The span the chart covers: a day before the first quiz to a day after the last, so end dots never touch the edge. */
export function timeDomain(points: SeriesPoint[]): [number, number] {
  if (points.length === 0) return [0, DAY];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.at);
    hi = Math.max(hi, p.at);
  }
  return [lo - DAY, hi + DAY];
}

export interface ChartPoint {
  /** Where it sits on the time axis (ms). */
  x: number;
  /** 0 to 1. */
  v: number;
  /** The quizzes behind it, oldest first. */
  items: SeriesPoint[];
  /** The start of its week or month, or the quiz time on the per-quiz axis. */
  start: number;
}

/**
 * Turns a category's quizzes into the dots to draw.
 * "quiz": one dot per quiz, on the time it was taken.
 * "week" / "month": one dot per period, in the middle of it, showing the average result of that period's quizzes,
 * or the running category average as it stood at the end of the period.
 */
export function chartPoints(
  points: SeriesPoint[],
  axis: TimeAxis,
  measure: Measure,
  domain: [number, number],
): ChartPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const pick = (p: SeriesPoint) => (measure === "result" ? p.credit : p.avg);
  if (axis === "quiz") return sorted.map((p) => ({ x: p.at, v: pick(p), items: [p], start: p.at }));

  const groups = new Map<number, SeriesPoint[]>();
  for (const p of sorted) {
    const s = periodStart(p.at, axis);
    groups.set(s, [...(groups.get(s) ?? []), p]);
  }
  return Array.from(groups.entries()).map(([start, items]) => {
    const lo = Math.max(domain[0], start);
    const hi = Math.min(domain[1], periodEnd(start, axis));
    const v =
      measure === "result" ? items.reduce((s, p) => s + p.credit, 0) / items.length : items[items.length - 1].avg;
    return { x: (lo + hi) / 2, v, items, start };
  });
}

/** The weeks or months the chart covers, for the stripes behind the lines. */
export function periodsIn(domain: [number, number], axis: "week" | "month"): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let s = periodStart(domain[0], axis);
  while (s < domain[1]) {
    const e = periodEnd(s, axis);
    out.push({ start: Math.max(domain[0], s), end: Math.min(domain[1], e) });
    s = e;
  }
  return out;
}

/**
 * The lowest value to show, so the lines use the height. Always keeps every `keep` value (the goal and the minimum)
 * in view. The step between grid lines is 5 points when the range is short, otherwise 10.
 */
export function fitRange(values: number[], keep: number[]): { lo: number; step: number } {
  const lowest = Math.min(...values, ...keep);
  const lo5 = Math.max(0, Math.floor((lowest - 0.04) * 20 + 1e-9) / 20);
  const step = 1 - lo5 <= 0.4 + 1e-9 ? 0.05 : 0.1;
  const lo = Math.max(0, Math.floor(lo5 / step + 1e-9) * step);
  return { lo: Math.round(lo * 100) / 100, step };
}