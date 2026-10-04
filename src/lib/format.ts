/** 75000 -> "1:15" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 0.9134 -> "91.3%" */
export function formatPercent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** 1.234 -> "1.2×" */
export function formatRatio(x: number): string {
  return `${x.toFixed(1)}×`;
}
