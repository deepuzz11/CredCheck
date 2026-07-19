"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScanResult } from "@/lib/scan";
import type { RiskBand } from "@/lib/score/provisional";
import { MODULES } from "@/lib/modules-manifest";
import { detectAndNormalize, type InputType } from "@/lib/input/detect";
import { streamScan } from "@/lib/streamScan";
import { Panel } from "@/components/Panel";

/**
 * /batch — scan a whole shopping list. Targets run sequentially (a scan is
 * expensive and the API is rate-limited to protect free upstream sources),
 * each row showing live check progress, then its verdict. Capped at
 * MAX_TARGETS per run, which fits inside the per-IP rate limit.
 */

const MAX_TARGETS = 5;

const BAND_UI: Record<RiskBand, { label: string; cls: string }> = {
  trusted: { label: "LIKELY LEGITIMATE", cls: "text-emerald-400" },
  caution: { label: "CAUTION ADVISED", cls: "text-amber-400" },
  high: { label: "HIGH RISK", cls: "text-red-400" },
};

interface Row {
  raw: string;
  key: string;
  type: InputType;
  totalChecks: number;
  status: "queued" | "scanning" | "done" | "error";
  progress: number;
  result?: ScanResult;
  error?: string;
}

export default function BatchPage() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function run() {
    const lines = text
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: Row[] = [];
    const errs: string[] = [];
    const seen = new Set<string>();
    for (const raw of lines) {
      if (parsed.length >= MAX_TARGETS) {
        errs.push(`Capped at ${MAX_TARGETS} targets per batch — "${raw}" and anything after it were skipped.`);
        break;
      }
      try {
        const n = detectAndNormalize(raw);
        if (seen.has(n.normalized)) continue;
        seen.add(n.normalized);
        parsed.push({
          raw,
          key: n.normalized,
          type: n.type,
          totalChecks: MODULES.filter(
            (m) => m.built && m.key !== "llm_synthesis" && m.appliesTo.includes(n.type),
          ).length,
          status: "queued",
          progress: 0,
        });
      } catch (e) {
        errs.push(`"${raw}" — ${e instanceof Error ? e.message : "not recognized"}`);
      }
    }

    setProblems(errs);
    setRows(parsed);
    if (parsed.length === 0) return;

    setRunning(true);
    for (let i = 0; i < parsed.length; i++) {
      patchRow(i, { status: "scanning" });
      try {
        const result = await streamScan(parsed[i].raw, {
          onSignal: () => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, progress: r.progress + 1 } : r))),
        });
        patchRow(i, { status: "done", result });
      } catch (e) {
        patchRow(i, {
          status: "error",
          error: e instanceof Error ? e.message : "Scan failed.",
        });
      }
    }
    setRunning(false);
  }

  const done = rows.filter((r) => r.status === "done" && r.result);
  const allSettled = rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "error");

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // batch mode
        </p>
        <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_14px_rgba(74,222,128,0.4)]">
          SCAN A WHOLE LIST
        </h1>
        <p className="mt-2 text-sm text-emerald-100/50">
          Comparing a few shops before you buy? Paste them all — one per line, up to{" "}
          {MAX_TARGETS} — and get every verdict in one table. Targets run one at a time.
        </p>
      </header>

      <Panel label="targets" className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"example.com\n@somehandle\nanother-shop.net"}
          rows={5}
          spellCheck={false}
          disabled={running}
          className="w-full border border-emerald-400/20 bg-black/40 px-3 py-2.5 text-sm text-emerald-100 outline-none placeholder:text-emerald-100/25 focus:border-emerald-400/40 disabled:opacity-50"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] text-emerald-100/30">
            one target per line (or comma-separated) · max {MAX_TARGETS} per batch
          </p>
          <button
            type="button"
            onClick={run}
            disabled={running || !text.trim()}
            className="shrink-0 border border-emerald-400/60 bg-emerald-400/10 px-5 py-2 text-sm font-semibold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Scanning…" : "Run batch ▶"}
          </button>
        </div>
      </Panel>

      {problems.length > 0 && (
        <div className="mt-4 border border-amber-400/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-300/90">
          {problems.map((p, i) => (
            <p key={i}>! {p}</p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <Panel label="results" className="p-4">
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <BatchRow key={r.key} row={r} index={i} />
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {allSettled && done.length > 1 && <BatchSummary rows={done} />}

      <footer className="mt-10 text-center text-xs text-emerald-100/40">
        <Link href="/" className="text-emerald-400/70 transition hover:text-emerald-300">
          ← single-target scanner
        </Link>
      </footer>
    </main>
  );
}

function BatchRow({ row, index }: { row: Row; index: number }) {
  const score = row.result?.score;
  return (
    <li className="flex items-center gap-3 border-b border-emerald-400/5 pb-2 text-sm last:border-0 last:pb-0">
      <span className="shrink-0 text-xs tabular-nums text-emerald-400/50">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1 truncate text-emerald-100/80">{row.key}</span>

      {row.status === "queued" && (
        <span className="shrink-0 text-xs text-emerald-100/30">[queued]</span>
      )}

      {row.status === "scanning" && (
        <span className="flex shrink-0 items-center gap-2 text-xs text-emerald-100/60">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
          {row.progress}/{row.totalChecks} checks
        </span>
      )}

      {row.status === "error" && (
        <span className="shrink-0 text-xs text-red-400" title={row.error}>
          [failed]
        </span>
      )}

      {row.status === "done" && score && (
        <>
          <span className={`shrink-0 font-bold tabular-nums ${BAND_UI[score.risk_band].cls}`}>
            {score.trust_score}
          </span>
          <span className={`hidden shrink-0 text-xs sm:inline ${BAND_UI[score.risk_band].cls}`}>
            {BAND_UI[score.risk_band].label}
          </span>
          {row.result?.id ? (
            <Link
              href={`/report/${row.result.id}`}
              className="shrink-0 text-xs text-emerald-300/70 transition hover:text-emerald-300"
            >
              [open]
            </Link>
          ) : (
            <Link
              href={`/?rescan=${encodeURIComponent(row.raw)}`}
              className="shrink-0 text-xs text-emerald-300/70 transition hover:text-emerald-300"
            >
              [open]
            </Link>
          )}
        </>
      )}
    </li>
  );
}

function BatchSummary({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort(
    (a, b) => (b.result?.score.trust_score ?? 0) - (a.result?.score.trust_score ?? 0),
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const worstBand = worst.result?.score.risk_band ?? "caution";
  return (
    <div className="mt-4">
      <Panel label="summary" className="p-4 text-sm">
        <p className="text-emerald-100/70">
          &gt; highest score of this batch:{" "}
          <span className="font-bold text-emerald-400">{best.key}</span>{" "}
          ({best.result?.score.trust_score}/100)
        </p>
        <p className="mt-1 text-emerald-100/70">
          &gt; {worstBand === "trusted" ? "lowest score" : "most caution needed"}:{" "}
          <span className={`font-bold ${BAND_UI[worstBand].cls}`}>{worst.key}</span>{" "}
          ({worst.result?.score.trust_score}/100)
        </p>
        <p className="mt-2 text-[10px] text-emerald-100/40">
          Relative ranking only — read each full report before trusting any of them.
        </p>
      </Panel>
    </div>
  );
}
