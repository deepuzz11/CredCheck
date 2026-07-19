/**
 * Tiny single-series line of past trust scores (oldest → newest). Fixed 0–100
 * domain so the same shape always means the same movement. Pure SVG with no
 * client hooks — renders in both server components (history rows) and client
 * components (the verdict card).
 */
export function TrendSparkline({
  trend,
  width = 96,
  height = 22,
}: {
  trend: number[];
  width?: number;
  height?: number;
}) {
  if (trend.length < 2) return null;
  const PAD = 2;
  const step = (width - PAD * 2) / (trend.length - 1);
  const y = (v: number) => PAD + (1 - v / 100) * (height - PAD * 2);
  const points = trend.map((v, i) => `${PAD + i * step},${y(v).toFixed(1)}`).join(" ");
  const last = trend[trend.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trust score over the last ${trend.length} scans: ${trend.join(", ")}`}
      className="shrink-0 text-emerald-400/80"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={PAD + (trend.length - 1) * step} cy={y(last)} r="2" fill="currentColor" />
    </svg>
  );
}
