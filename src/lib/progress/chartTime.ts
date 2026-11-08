import type { SeriesPoint } from "./analytics";

export type TimeAxis = "day" | "week" | "month";
/** "average": the line's average after each quiz. "result": each quiz's own score. */
export type Measure = "average" | "result";

const DAY = 86_400_000;

/** When the day, week (Monday first) or month that holds `ms` begins, in local time. */
export function periodStart(ms: number, axis: TimeAxis): number {
  const d = new Date(ms);
  if (axis === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (axis === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

/** When the next day, week or month begins. */
export function periodEnd(start: number, axis: TimeAxis): number {
  const d = new Date(start);
  if (axis === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (axis === "day" ? 1 : 7)).getTime();
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
  /** The start of its day, week or month. */
  start: number;
}

/**
 * Turns a line's quizzes into the dots to draw: one dot per day, week or month, in the middle of it, so every quiz of
 * that period is one dot. It shows the line's average as it stood at the end of the period, or with "result" the
 * average score of that period's quizzes.
 */
export function chartPoints(
  points: SeriesPoint[],
  axis: TimeAxis,
  measure: Measure,
  domain: [number, number],
): ChartPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const groups = new Map<number, SeriesPoint[]>();
  for (const p of sorted) {
    const s = periodStart(p.at, axis);
    groups.set(s, [...(groups.get(s) ?? []), p]);
  }
  return Array.from(groups.entries()).map(([start, items]) => {
    const lo = Math.max(domain[0], start);
    const hi = Math.min(domain[1], periodEnd(start, axis));
    const v =
      measure === "average" ? items[items.length - 1].avg : items.reduce((s, p) => s + p.credit, 0) / items.length;
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