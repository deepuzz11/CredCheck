"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScanResult } from "@/lib/scan";
import type { SignalResult, SignalStatus } from "@/lib/signals/types";
import type { RiskBand } from "@/lib/score/provisional";
import { MODULES } from "@/lib/modules-manifest";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { ScoreBreakdownChart } from "./ScoreBreakdownChart";
import { Panel } from "./Panel";

const BAND_UI: Record<
  RiskBand,
  { label: string; text: string; glow: string; border: string }
> = {
  trusted: {
    label: "LIKELY LEGITIMATE",
    text: "text-emerald-400",
    glow: "[text-shadow:0_0_18px_rgba(74,222,128,0.6)]",
    border: "border-emerald-400/60",
  },
  caution: {
    label: "CAUTION ADVISED",
    text: "text-amber-400",
    glow: "[text-shadow:0_0_18px_rgba(251,191,36,0.6)]",
    border: "border-amber-400/60",
  },
  high: {
    label: "HIGH RISK",
    text: "text-red-400",
    glow: "[text-shadow:0_0_18px_rgba(248,113,113,0.6)]",
    border: "border-red-400/60",
  },
};

const STATUS_UI: Record<SignalStatus, { tag: string; text: string }> = {
  ok: { tag: "[OK]", text: "text-emerald-400" },
  flag: { tag: "[!!]", text: "text-amber-400" },
  unavailable: { tag: "[--]", text: "text-emerald-100/30" },
};

/** "just now" / "5m ago" / "3h ago" / "2d ago" — how stale a cached result is. */
function relativeAge(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / (24 * 60))}d ago`;
}

/** Counts 0 → target with an ease-out curve, giving the score reveal a
 *  spin-up feel. Skipped entirely for prefers-reduced-motion users. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs]);
  return value;
}

export function ResultsView({
  result,
  onRescan,
}: {
  result: ScanResult;
  /** rerun the scan with the cache bypassed; when absent (e.g. on a shared
   *  report page) the rescan button deep-links to the scanner instead */
  onRescan?: () => void;
}) {
  const { score, input, signals } = result;
  const ui = BAND_UI[score.risk_band];
  const displayScore = useCountUp(score.trust_score);

  const notChecked = useMemo(() => {
    const done = new Set(signals.map((s) => s.signal_name));
    return MODULES.filter(
      (m) => m.key !== "llm_synthesis" && !done.has(m.key) && m.appliesTo.includes(input.type),
    );
  }, [signals, input.type]);

  return (
    <div className="space-y-4">
      {/* Score card */}
      <Panel label="verdict" className="p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div
            className={`relative flex h-24 w-24 shrink-0 flex-col items-center justify-center border-2 bg-black/40 ${ui.border}`}
          >
            <span className={`text-3xl font-bold tabular-nums ${ui.text} ${ui.glow}`}>
              {displayScore}
            </span>
            <span className="text-[10px] text-emerald-100/40">/ 100</span>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <span className={`text-lg font-semibold tracking-wide ${ui.text} ${ui.glow}`}>
              {ui.label}
            </span>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-emerald-100/50 sm:justify-start">
              <span>
                &gt; {input.type} :: {input.normalized}
              </span>
              {result.cached && (
                <span className="border border-sky-400/40 px-1.5 py-0.5 text-sky-300">
                  [cached · {relativeAge(result.scanned_at)}]
                </span>
              )}
            </div>
            {/* Confidence */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-emerald-100/40">
                <span>confidence</span>
                <span>{Math.round(score.confidence * 100)}%</span>
              </div>
              <div className="h-2 w-full border border-emerald-400/15 bg-black/40">
                <div
                  className="h-full bg-emerald-400/70 shadow-[0_0_8px_rgba(74,222,128,0.7)]"
                  style={{ width: `${Math.max(4, score.confidence * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {signals.length > 0 && (
          <div className="mt-5 border-t border-emerald-400/10 pt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-emerald-100/40">
              score breakdown — {signals.length} signal{signals.length === 1 ? "" : "s"} checked
            </p>
            <ScoreBreakdownChart signals={signals} />
          </div>
        )}

        {score.provisional && (
          <p className="mt-4 border border-amber-400/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300/90">
            &gt; note: scored with rule-based logic (no LLM configured, or the LLM was
            unreachable) — see &quot;what we couldn&apos;t check&quot; below.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {result.cached && <RescanButton raw={input.raw} onRescan={onRescan} />}
          {result.id && <CopyLinkButton id={result.id} />}
          <CopyVerdictButton result={result} />
          <WatchButton result={result} />
          {result.id && <BadgeEmbedButton normalizedKey={input.normalized} id={result.id} />}
          <ReportScamButton input={input} />
        </div>
      </Panel>

      {/* Homepage capture — visual evidence of what the page looked like */}
      {result.screenshot_data_url && (
        <Panel label="capture" className="p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.screenshot_data_url}
            alt={`Homepage of ${input.normalized} at scan time`}
            className="w-full border border-emerald-400/15"
          />
          <p className="mt-2 text-[10px] text-emerald-100/40">
            &gt; homepage as our scanner saw it · {new Date(result.scanned_at).toLocaleString()}
          </p>
        </Panel>
      )}

      {/* Explanation */}
      <Panel label="findings" className="p-6">
        <ul className="space-y-2 text-sm">
          {score.explanation_bullets.map((b, i) => (
            <li key={i} className="flex gap-2 leading-relaxed text-emerald-100/80">
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Per-signal detail */}
      <Panel label="signals" className="p-6">
        <ul className="space-y-1.5">
          {signals.map((s) => (
            <SignalRow key={s.signal_name} signal={s} />
          ))}
        </ul>
      </Panel>

      {/* What we couldn't check */}
      {(score.data_gaps.length > 0 || notChecked.length > 0) && (
        <Panel label="gaps" className="p-6">
          <ul className="space-y-2 text-sm text-emerald-100/50">
            {score.data_gaps.map((g, i) => (
              <li key={`gap-${i}`} className="flex gap-2 leading-relaxed">
                <span>·</span>
                <span>{g}</span>
              </li>
            ))}
            {notChecked.map((m) => (
              <li key={m.key} className="flex gap-2 leading-relaxed">
                <span>·</span>
                <span>
                  {m.label} — <span className="italic">not built yet</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: SignalResult }) {
  const ui = STATUS_UI[signal.status];
  const hasData = signal.data && Object.keys(signal.data).length > 0;
  return (
    <li className="border-b border-emerald-400/5 py-1.5 last:border-0">
      <details>
        <summary className="flex cursor-pointer list-none items-start gap-2.5 text-sm">
          <span className={`mt-0.5 shrink-0 font-bold ${ui.text}`}>{ui.tag}</span>
          <span className="flex-1">
            <span className="text-emerald-100">{signal.label}</span>
            <span className="mt-0.5 block text-xs text-emerald-100/40">{signal.notes}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            {typeof signal.duration_ms === "number" && (
              <span className="text-[10px] tabular-nums text-emerald-100/25">
                {(signal.duration_ms / 1000).toFixed(2)}s
              </span>
            )}
            {hasData && <span className="text-xs text-emerald-100/30">[details]</span>}
            <a
              href="/about#signals"
              title="How this check works"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-emerald-100/25 transition hover:text-emerald-300"
            >
              [?]
            </a>
          </span>
        </summary>
        {hasData && (
          <pre className="mt-2 overflow-x-auto border border-emerald-400/10 bg-black/60 p-2 text-[11px] leading-relaxed text-emerald-300/80">
            {JSON.stringify(signal.data, null, 2)}
          </pre>
        )}
      </details>
    </li>
  );
}

function TerminalButton({
  children,
  onClick,
  href,
  disabled,
  tone = "emerald",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "emerald" | "red" | "sky";
}) {
  const toneClasses: Record<string, string> = {
    emerald:
      "border-emerald-400/30 text-emerald-300 hover:border-emerald-400/60 hover:bg-emerald-400/10",
    red: "border-red-400/30 text-red-300 hover:border-red-400/60 hover:bg-red-400/10",
    sky: "border-sky-400/30 text-sky-300 hover:border-sky-400/60 hover:bg-sky-400/10",
  };
  const cls = `inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses[tone]}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

function RescanButton({ raw, onRescan }: { raw: string; onRescan?: () => void }) {
  const rescan =
    onRescan ??
    (() => {
      window.location.href = `/?rescan=${encodeURIComponent(raw)}&force=1`;
    });
  return (
    <TerminalButton onClick={rescan} tone="sky">
      [ rescan fresh ↻ ]
    </TerminalButton>
  );
}

function WatchButton({ result }: { result: ScanResult }) {
  const [watched, setWatched] = useState(false);
  useEffect(() => {
    setWatched(isWatched(result.input.normalized));
  }, [result.input.normalized]);

  function toggle() {
    setWatched(
      toggleWatch({
        raw: result.input.raw,
        key: result.input.normalized,
        score: result.score.trust_score,
        band: result.score.risk_band,
        scanned_at: result.scanned_at,
      }),
    );
  }

  return (
    <TerminalButton onClick={toggle}>
      {watched ? "[ watching ✓ ]" : "[ watch ]"}
    </TerminalButton>
  );
}

function CopyVerdictButton({ result }: { result: ScanResult }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const { score, input } = result;
    const lines = [
      `CredCheck scan — ${input.normalized}`,
      `Verdict: ${BAND_UI[score.risk_band].label} — ${score.trust_score}/100 (confidence ${Math.round(score.confidence * 100)}%)`,
      "",
      ...score.explanation_bullets
        .slice(0, 6)
        .map((b) => (/^[✓⚠·✗-]/.test(b) ? b : `- ${b}`)),
    ];
    if (result.id) lines.push("", `Full report: ${window.location.origin}/report/${result.id}`);
    lines.push("", "Informational only — not a guarantee or a verdict on any seller.");
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this summary:", text);
    }
  }

  return (
    <TerminalButton onClick={copy}>
      {copied ? "[ summary copied ]" : "[ copy as text ]"}
    </TerminalButton>
  );
}

function CopyLinkButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/report/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return <TerminalButton onClick={copy}>{copied ? "[ link copied ]" : "[ copy link ]"}</TerminalButton>;
}

function BadgeEmbedButton({ normalizedKey, id }: { normalizedKey: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return <TerminalButton onClick={() => setOpen(true)}>[ embed badge ]</TerminalButton>;
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const badgeUrl = `${origin}/api/badge?key=${encodeURIComponent(normalizedKey)}`;
  const reportUrl = `${origin}/report/${id}`;
  const snippet = `<a href="${reportUrl}"><img src="${badgeUrl}" alt="CredCheck trust badge" /></a>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this snippet:", snippet);
    }
  }

  return (
    <div className="w-full border border-emerald-400/20 bg-black/40 p-3">
      <p className="mb-2 text-xs text-emerald-100/50">
        &gt; embed this on your site — always shows the latest scan for this target:
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={badgeUrl} alt="CredCheck trust badge preview" className="mb-2 h-auto" />
      <pre className="mb-2 overflow-x-auto border border-emerald-400/10 bg-black/60 p-2 text-[11px] text-emerald-300/80">
        {snippet}
      </pre>
      <div className="flex gap-2">
        <TerminalButton onClick={copy}>{copied ? "[ copied ]" : "[ copy snippet ]"}</TerminalButton>
        <TerminalButton onClick={() => setOpen(false)}>[ close ]</TerminalButton>
      </div>
    </div>
  );
}

function ReportScamButton({ input }: { input: ScanResult["input"] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const target = input.domain ?? input.handle;
  if (!target) return null;

  async function submit() {
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: input.raw, reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't submit the report.");
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-red-400/30 px-3 py-1.5 text-xs text-red-300">
        🚩 reported — pending moderation, thanks
      </span>
    );
  }

  if (!open) {
    return (
      <TerminalButton onClick={() => setOpen(true)} tone="red">
        [ report as scam ]
      </TerminalButton>
    );
  }

  return (
    <div className="w-full border border-red-400/20 bg-black/40 p-3">
      <p className="mb-2 text-xs text-emerald-100/50">
        &gt; report <span className="text-red-300">{target}</span> as a scam. Unverified,
        moderator-reviewed before it counts toward future scans.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="what happened? (optional)"
        rows={2}
        maxLength={500}
        className="mb-2 w-full border border-emerald-400/15 bg-black/40 px-2 py-1.5 text-xs text-emerald-100 outline-none placeholder:text-emerald-100/25 focus:border-emerald-400/40"
      />
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <TerminalButton onClick={submit} disabled={status === "submitting"} tone="red">
          {status === "submitting" ? "[ submitting… ]" : "[ submit report ]"}
        </TerminalButton>
        <TerminalButton onClick={() => setOpen(false)}>[ cancel ]</TerminalButton>
      </div>
    </div>
  );
}
