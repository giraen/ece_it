/** A tiny line of values between 0 and 1. */
export default function Sparkline({
  values,
  width = 110,
  height = 26,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-xs text-muted">–</span>;
  const pts = values
    .slice(-12)
    .map((v, i, a) => `${(i / (a.length - 1)) * width},${height - 2 - Math.min(1, Math.max(0, v)) * (height - 4)}`)
    .join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label={`Trend over ${Math.min(values.length, 12)} quizzes`}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}