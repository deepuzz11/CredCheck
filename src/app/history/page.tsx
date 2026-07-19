import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";
import { Panel } from "@/components/Panel";
import { TrendSparkline } from "@/components/TrendSparkline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan history — CredCheck" };

const RISK_DOT: Record<string, string> = {
  trusted: "bg-emerald-400",
  caution: "bg-amber-400",
  high: "bg-red-400",
};

const BANDS = ["trusted", "caution", "high"] as const;
type Band = (typeof BANDS)[number];

async function loadHistory(q: string, band: Band | null) {
  if (!process.env.DATABASE_URL) return { rows: [], dbConfigured: false as const };
  try {
    // Text match happens in the DB; the verdict lives inside the result JSON,
    // so filter that in JS over a wider window (fine at this scale).
    const rows = await prisma.scanCache.findMany({
      where: q ? { normalizedKey: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { createdAt: "desc" },
      take: band ? 200 : 30,
    });
    const filtered = band
      ? rows
          .filter((r) => (r.resultJson as unknown as ScanResult)?.score?.risk_band === band)
          .slice(0, 30)
      : rows;
    return { rows: filtered, dbConfigured: true as const };
  } catch {
    return { rows: [], dbConfigured: true as const, error: true as const };
  }
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; band?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const bandFilter = BANDS.includes(sp.band as Band) ? (sp.band as Band) : null;
  const { rows, dbConfigured, error } = await loadHistory(q, bandFilter);
  const now = Date.now();
  const filtering = Boolean(q || bandFilter);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // recent scans
        </p>
        <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_16px_rgba(74,222,128,0.45)]">
          SCAN HISTORY
        </h1>
        <p className="mt-1 text-sm text-emerald-100/40">
          Cached for 48h. Expired entries stay listed for reference but need a fresh scan to view.
        </p>
      </header>

      {dbConfigured && (
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2 border border-emerald-400/20 bg-black/40 px-3 py-2">
            <span className="text-emerald-400/70" aria-hidden>
              /
            </span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="filter by target…"
              autoComplete="off"
              spellCheck={false}
              className="w-full min-w-0 bg-transparent text-emerald-100 outline-none placeholder:text-emerald-100/25"
            />
          </div>
          <select
            name="band"
            defaultValue={bandFilter ?? ""}
            className="border border-emerald-400/20 bg-black/40 px-2 py-2 text-emerald-100"
          >
            <option value="">all verdicts</option>
            <option value="trusted">trusted</option>
            <option value="caution">caution</option>
            <option value="high">high risk</option>
          </select>
          <button
            type="submit"
            className="border border-emerald-400/30 px-3 py-2 text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"
          >
            [ filter ]
          </button>
          {filtering && (
            <Link
              href="/history"
              className="border border-emerald-400/15 px-3 py-2 text-emerald-100/50 transition hover:border-emerald-400/40 hover:text-emerald-300"
            >
              [ clear ]
            </Link>
          )}
        </form>
      )}

      {!dbConfigured && (
        <Panel className="p-6 text-sm text-emerald-100/50">
          History requires caching to be enabled (set{" "}
          <code className="text-emerald-300">DATABASE_URL</code> and run the Postgres migration —
          see the README).
        </Panel>
      )}

      {dbConfigured && error && (
        <div className="border border-red-400/40 bg-red-950/30 p-6 text-sm text-red-300">
          Couldn&apos;t reach the database right now.
        </div>
      )}

      {dbConfigured && !error && rows.length === 0 && (
        <Panel className="p-6 text-sm text-emerald-100/50">
          {filtering ? (
            <>No scans match that filter.</>
          ) : (
            <>
              No scans yet.{" "}
              <Link href="/" className="text-emerald-400 underline">
                Run one
              </Link>
              .
            </>
          )}
        </Panel>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => {
            const expired = row.expiresAt.getTime() <= now;
            const result = row.resultJson as unknown as ScanResult;
            const band = result?.score?.risk_band ?? "caution";
            const trustScore = result?.score?.trust_score;
            // Rescan with what the user originally typed — the normalized key
            // ("instagram:@x", "marketplace:https://…") isn't valid scanner input.
            const rescanTarget = result?.input?.raw ?? row.normalizedKey;
            return (
              <li key={row.id}>
                <Link
                  href={expired ? `/?rescan=${encodeURIComponent(rescanTarget)}` : `/report/${row.id}`}
                  className="flex items-center gap-3 border border-emerald-400/15 bg-black/40 px-4 py-3 text-sm transition hover:border-emerald-400/50 hover:bg-emerald-400/5"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${expired ? "bg-emerald-100/20" : RISK_DOT[band] ?? "bg-emerald-100/30"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-emerald-100">{row.normalizedKey}</span>
                    <span className="text-xs text-emerald-100/35">
                      {row.inputType} · {row.createdAt.toLocaleString()}
                      {expired && " · expired"}
                    </span>
                  </span>
                  {Array.isArray(result?.trend) && result.trend.length >= 2 && (
                    <span className="hidden shrink-0 sm:inline-flex" title="score trend">
                      <TrendSparkline trend={result.trend} width={64} height={18} />
                    </span>
                  )}
                  {typeof trustScore === "number" && !expired && (
                    <span className="shrink-0 border border-emerald-400/20 px-2.5 py-1 text-xs tabular-nums text-emerald-300">
                      {trustScore}/100
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
