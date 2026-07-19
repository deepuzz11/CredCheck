import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";
import type { RiskBand } from "@/lib/score/provisional";
import { Panel } from "@/components/Panel";

/**
 * /stats — the observatory. Aggregates over the scan cache (last 500 scans)
 * plus the scam-report queue. Server-rendered, zero client JS.
 *
 * Chart notes (dataviz method): risk bands are STATE, so the marks wear the
 * fixed status palette — good #0ca30c / warning #fab219 / critical #d03b3b —
 * validated against this app's panel surface (#0a0f0c): adjacent CVD ΔE 11.3,
 * normal-vision ΔE 27.6, contrast all ≥3:1. Status color never travels alone:
 * every segment ships an icon-style tag + label + count. The histogram is a
 * single-series magnitude chart → one hue (the app accent), direct label on
 * the peak bin only, sr-only table as the accessible fallback. Square mark
 * corners are the house idiom (see ScoreBreakdownChart).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan statistics — CredCheck",
  description: "Aggregate trust-scan statistics: risk-band distribution, score histogram, and recent activity.",
};

const BAND_CHART: Record<RiskBand, { color: string; tag: string; label: string; text: string }> = {
  trusted: { color: "#0ca30c", tag: "[OK]", label: "Likely legitimate", text: "text-emerald-400" },
  caution: { color: "#fab219", tag: "[!!]", label: "Caution advised", text: "text-amber-400" },
  high: { color: "#d03b3b", tag: "[XX]", label: "High risk", text: "text-red-400" },
};

const BAND_ORDER: RiskBand[] = ["trusted", "caution", "high"];

interface StatsRow {
  id: string;
  key: string;
  inputType: string;
  score: number;
  band: RiskBand;
  createdAt: Date;
}

interface Stats {
  totalScans: number;
  sample: StatsRow[];
  bandCounts: Record<RiskBand, number>;
  avgScore: number;
  bins: number[]; // 10 bins: 0–9 … 90–100
  reportCounts: { approved: number; pending: number };
  /** scans per day, oldest → newest, one entry per day incl. zero days */
  daily: Array<{ day: string; count: number }>;
}

const DAILY_DAYS = 14;

async function loadStats(): Promise<Stats | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    // All bucketing in UTC — labels come from toISOString, so the window
    // boundary must too, or today's scans can fall outside every bucket.
    const now = new Date();
    const dailyFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAILY_DAYS - 1)),
    );

    const [totalScans, rows, reports, historyRows] = await Promise.all([
      prisma.scanCache.count(),
      prisma.scanCache.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.scamReport.groupBy({ by: ["status"], _count: true }),
      prisma.scanHistory.findMany({
        where: { createdAt: { gte: dailyFrom } },
        select: { createdAt: true },
      }),
    ]);

    const daily: Array<{ day: string; count: number }> = [];
    for (let i = 0; i < DAILY_DAYS; i++) {
      const d = new Date(dailyFrom.getTime() + i * 86_400_000);
      daily.push({ day: d.toISOString().slice(0, 10), count: 0 });
    }
    for (const h of historyRows) {
      const key = h.createdAt.toISOString().slice(0, 10);
      const bucket = daily.find((b) => b.day === key);
      if (bucket) bucket.count += 1;
    }

    const sample: StatsRow[] = [];
    for (const row of rows) {
      const result = row.resultJson as unknown as ScanResult;
      const score = result.score?.trust_score;
      const band = result.score?.risk_band;
      if (typeof score !== "number" || !band) continue;
      sample.push({
        id: row.id,
        key: row.normalizedKey,
        inputType: row.inputType,
        score,
        band,
        createdAt: row.createdAt,
      });
    }

    const bandCounts: Record<RiskBand, number> = { trusted: 0, caution: 0, high: 0 };
    const bins = Array.from({ length: 10 }, () => 0);
    let scoreSum = 0;
    for (const s of sample) {
      bandCounts[s.band] += 1;
      scoreSum += s.score;
      bins[Math.min(9, Math.floor(s.score / 10))] += 1;
    }

    const reportCounts = { approved: 0, pending: 0 };
    for (const r of reports) {
      if (r.status === "approved") reportCounts.approved = r._count;
      if (r.status === "pending") reportCounts.pending = r._count;
    }

    return {
      totalScans,
      sample,
      bandCounts,
      avgScore: sample.length ? Math.round(scoreSum / sample.length) : 0,
      bins,
      reportCounts,
      daily,
    };
  } catch (err) {
    console.warn("[/stats] load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function StatsPage() {
  const stats = await loadStats();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // observatory
        </p>
        <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_14px_rgba(74,222,128,0.4)]">
          SCAN STATISTICS
        </h1>
        <p className="mt-2 text-sm text-emerald-100/50">
          What this instance has scanned and how it scored — aggregated from the shared
          result cache{stats && stats.sample.length > 0 ? ` (last ${stats.sample.length} scans)` : ""}.
        </p>
      </header>

      {!stats ? (
        <EmptyState message="Statistics need the result cache. Set DATABASE_URL (see README — `npm run db:up && npm run db:migrate`), scan a few targets, and this page lights up." />
      ) : stats.sample.length === 0 ? (
        <EmptyState message="No scans in the cache yet. Run a few scans and come back — every result feeds this page." />
      ) : (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="scans cached" value={String(stats.totalScans)} />
            <StatTile label="average score" value={`${stats.avgScore}`} suffix="/ 100" />
            <StatTile
              label="high-risk share"
              value={`${stats.sample.length ? Math.round((stats.bandCounts.high / stats.sample.length) * 100) : 0}%`}
            />
            <StatTile
              label="scam reports"
              value={String(stats.reportCounts.approved)}
              suffix={stats.reportCounts.pending > 0 ? `+${stats.reportCounts.pending} pending` : "approved"}
            />
          </div>

          {/* Risk-band distribution — part-to-whole stacked bar */}
          <Panel label="verdict distribution" className="p-6">
            <BandBar counts={stats.bandCounts} total={stats.sample.length} />
          </Panel>

          {/* Score histogram */}
          <Panel label="score distribution" className="p-6">
            <Histogram bins={stats.bins} />
          </Panel>

          {/* Activity over time */}
          {stats.daily.some((d) => d.count > 0) && (
            <Panel label="activity" className="p-6">
              <DailyBars daily={stats.daily} />
            </Panel>
          )}

          {/* Watchlist + latest */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel label="lowest scores (recent)" className="p-5">
              <ScanList
                rows={[...stats.sample].sort((a, b) => a.score - b.score).slice(0, 5)}
              />
            </Panel>
            <Panel label="latest scans" className="p-5">
              <ScanList rows={stats.sample.slice(0, 5)} />
            </Panel>
          </div>
        </div>
      )}

      <footer className="mt-10">
        <Panel className="px-4 py-3 text-center text-xs leading-relaxed text-emerald-100/40">
          Counts reflect this instance&apos;s cache, not the whole internet. Expired scans
          age out after 48h from permalinks but stay in these aggregates.
        </Panel>
      </footer>
    </main>
  );
}

function StatTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wider text-emerald-100/40">{label}</p>
      <p className="mt-1 text-2xl font-bold text-emerald-300 [text-shadow:0_0_12px_rgba(74,222,128,0.35)]">
        {value}
      </p>
      {suffix && <p className="text-[10px] text-emerald-100/40">{suffix}</p>}
    </Panel>
  );
}

function BandBar({ counts, total }: { counts: Record<RiskBand, number>; total: number }) {
  const present = BAND_ORDER.filter((b) => counts[b] > 0);
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden border border-emerald-400/10 bg-white/5"
        style={{ gap: "2px" }}
        role="img"
        aria-label={BAND_ORDER.map(
          (b) => `${counts[b]} of ${total} scans ${BAND_CHART[b].label.toLowerCase()}`,
        ).join(", ")}
      >
        {present.map((b) => (
          <div
            key={b}
            title={`${BAND_CHART[b].label}: ${counts[b]} of ${total}`}
            style={{
              width: `${(counts[b] / total) * 100}%`,
              backgroundColor: BAND_CHART[b].color,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {BAND_ORDER.map((b) => (
          <div key={b} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2 w-2 shrink-0"
              style={{ backgroundColor: BAND_CHART[b].color }}
              aria-hidden
            />
            <span className={`font-bold ${BAND_CHART[b].text}`}>{BAND_CHART[b].tag}</span>
            <span className="text-emerald-100/60">
              {BAND_CHART[b].label} — {counts[b]}
              {total > 0 && <> ({Math.round((counts[b] / total) * 100)}%)</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Histogram({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 1);
  const peak = bins.indexOf(Math.max(...bins));
  return (
    <div>
      <div className="flex h-28 items-end border-b border-emerald-400/20" style={{ gap: "2px" }}>
        {bins.map((count, i) => {
          const label = `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`;
          return (
            <div
              key={i}
              className="relative flex-1"
              title={`Score ${label}: ${count} scan${count === 1 ? "" : "s"}`}
            >
              {i === peak && count > 0 && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] tabular-nums text-emerald-100/60">
                  {count}
                </span>
              )}
              <div
                className="w-full bg-emerald-400/80"
                style={{ height: `${Math.max(count > 0 ? 3 : 0, (count / max) * 100)}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-emerald-100/30">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <p className="mt-1.5 text-[10px] text-emerald-100/40">trust score, 10-point bins</p>
      {/* Accessible fallback for the visual histogram */}
      <table className="sr-only">
        <caption>Trust-score distribution in 10-point bins</caption>
        <thead>
          <tr>
            <th scope="col">Score range</th>
            <th scope="col">Scans</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((count, i) => (
            <tr key={i}>
              <td>
                {i * 10}–{i === 9 ? 100 : i * 10 + 9}
              </td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyBars({ daily }: { daily: Array<{ day: string; count: number }> }) {
  const max = Math.max(...daily.map((d) => d.count), 1);
  const peak = daily.reduce((p, d) => (d.count > p.count ? d : p), daily[0]);
  return (
    <div>
      <div className="flex h-20 items-end border-b border-emerald-400/20" style={{ gap: "2px" }}>
        {daily.map((d) => (
          <div
            key={d.day}
            className="relative flex-1"
            title={`${d.day}: ${d.count} scan${d.count === 1 ? "" : "s"}`}
          >
            {d.day === peak.day && d.count > 0 && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] tabular-nums text-emerald-100/60">
                {d.count}
              </span>
            )}
            <div
              className="w-full bg-emerald-400/80"
              style={{ height: `${Math.max(d.count > 0 ? 3 : 0, (d.count / max) * 72)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-emerald-100/30">
        <span>{daily[0]?.day.slice(5)}</span>
        <span>{daily[daily.length - 1]?.day.slice(5)}</span>
      </div>
      <p className="mt-1.5 text-[10px] text-emerald-100/40">
        scans per day, last {daily.length} days (every scan counts, including rescans)
      </p>
      <table className="sr-only">
        <caption>Scans per day over the last {daily.length} days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Scans</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScanList({ rows }: { rows: StatsRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-emerald-100/40">nothing here yet</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/report/${r.id}`}
            className="flex items-baseline gap-2.5 text-xs transition hover:bg-emerald-400/5"
          >
            <span className={`w-7 shrink-0 text-right font-bold tabular-nums ${BAND_CHART[r.band].text}`}>
              {r.score}
            </span>
            <span className="truncate text-emerald-100/70">{r.key}</span>
            <span className="ml-auto shrink-0 text-[10px] text-emerald-100/30">
              {r.createdAt.toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Panel className="p-8 text-center">
      <p className="text-sm leading-relaxed text-emerald-100/50">{message}</p>
      <Link
        href="/"
        className="mt-5 inline-block border border-emerald-400/50 bg-emerald-400/10 px-5 py-2 text-sm text-emerald-300 transition hover:bg-emerald-400/20"
      >
        [ run a scan ]
      </Link>
    </Panel>
  );
}
