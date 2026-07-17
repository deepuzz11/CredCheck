import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";
import { Panel } from "@/components/Panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan history — CredCheck" };

const RISK_DOT: Record<string, string> = {
  trusted: "bg-emerald-400",
  caution: "bg-amber-400",
  high: "bg-red-400",
};

async function loadHistory() {
  if (!process.env.DATABASE_URL) return { rows: [], dbConfigured: false as const };
  try {
    const rows = await prisma.scanCache.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return { rows, dbConfigured: true as const };
  } catch {
    return { rows: [], dbConfigured: true as const, error: true as const };
  }
}

export default async function HistoryPage() {
  const { rows, dbConfigured, error } = await loadHistory();
  const now = Date.now();

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
          No scans yet.{" "}
          <Link href="/" className="text-emerald-400 underline">
            Run one
          </Link>
          .
        </Panel>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => {
            const expired = row.expiresAt.getTime() <= now;
            const result = row.resultJson as unknown as ScanResult;
            const band = result?.score?.risk_band ?? "caution";
            const trustScore = result?.score?.trust_score;
            return (
              <li key={row.id}>
                <Link
                  href={expired ? `/?rescan=${encodeURIComponent(row.normalizedKey)}` : `/report/${row.id}`}
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
