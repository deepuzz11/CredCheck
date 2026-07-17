import type { SignalResult, SignalStatus } from "@/lib/signals/types";

/**
 * Score breakdown — a part-to-whole composition of signal statuses
 * (ok / flag / unavailable), not a series-identity chart, so it wears the
 * fixed status palette rather than categorical hues: good (#0ca30c) and
 * warning (#fab219) are the reserved, contrast-checked status colors;
 * "unavailable" isn't a status verdict (no data ≠ bad) so it gets the
 * neutral muted-ink gray instead of a status hue.
 *
 * A horizontal stacked bar was chosen over a donut/radar: this is exactly
 * the "part-to-whole, few categories" job a stacked bar is for, and radar
 * charts are for multi-axis comparison, which this data isn't.
 *
 * Status color always ships with an icon + label (never color alone) — see
 * the legend below the bar. Same hex values in light and dark: the status
 * scale is fixed, not themed.
 */

const STATUS_COLOR: Record<SignalStatus, string> = {
  ok: "#0ca30c",
  flag: "#fab219",
  unavailable: "#898781",
};

const STATUS_CHART_LABEL: Record<SignalStatus, string> = {
  ok: "Passed",
  flag: "Flagged",
  unavailable: "No data",
};

const STATUS_ICON: Record<SignalStatus, string> = {
  ok: "[OK]",
  flag: "[!!]",
  unavailable: "[--]",
};

const ORDER: SignalStatus[] = ["ok", "flag", "unavailable"];

export function ScoreBreakdownChart({ signals }: { signals: SignalResult[] }) {
  if (signals.length === 0) return null;

  const counts: Record<SignalStatus, number> = { ok: 0, flag: 0, unavailable: 0 };
  for (const s of signals) counts[s.status]++;
  const total = signals.length;

  const present = ORDER.filter((status) => counts[status] > 0);

  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden border border-emerald-400/10 bg-white/5"
        style={{ gap: "2px" }}
        role="img"
        aria-label={present
          .map((s) => `${counts[s]} of ${total} signals ${STATUS_CHART_LABEL[s].toLowerCase()}`)
          .join(", ")}
      >
        {present.map((status) => (
          <div
            key={status}
            title={`${counts[status]} of ${total} signals: ${STATUS_CHART_LABEL[status]}`}
            style={{
              width: `${(counts[status] / total) * 100}%`,
              backgroundColor: STATUS_COLOR[status],
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {present.map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[status] }}
              aria-hidden
            />
            <span className="text-emerald-100/50">
              {STATUS_ICON[status]} {counts[status]} {STATUS_CHART_LABEL[status].toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
