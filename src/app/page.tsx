"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ScanResult } from "@/lib/scan";
import type { SignalResult } from "@/lib/signals/types";
import { MODULES } from "@/lib/modules-manifest";
import { detectAndNormalize, type InputType } from "@/lib/input/detect";
import { ResultsView } from "@/components/ResultsView";
import { RecentScans } from "@/components/RecentScans";
import { WatchlistPanel } from "@/components/WatchlistPanel";
import { updateWatch } from "@/lib/watchlist";
import { Panel } from "@/components/Panel";

const EXAMPLES = ["example.com", "@nike", "amazon.com/dp/B08N5WRWNW"];

type ScanPhase = "signals" | "synthesizing";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ScanApp />
    </Suspense>
  );
}

function ScanApp() {
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<InputType | null>(null);
  const [live, setLive] = useState<Record<string, SignalResult>>({});
  const [phase, setPhase] = useState<ScanPhase>("signals");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rescan = searchParams.get("rescan");
    if (rescan) {
      setInput(rescan);
      runScan(rescan, { force: searchParams.get("force") === "1" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terminal affordance: "/" jumps to the prompt from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function runScan(value: string, opts?: { force?: boolean }) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    setResult(null);
    setLive({});
    setPhase("signals");

    // Reuse the same detector the server uses, purely to know which checks
    // to show as "running" and to fail fast on obviously bad input.
    let detected: InputType;
    try {
      detected = detectAndNormalize(trimmed).type;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't understand that input.");
      return;
    }

    setLoadingType(detected);
    setLoading(true);
    try {
      const res = await fetch("/api/scan/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed, force: opts?.force ?? false }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? "Scan failed.",
        );
      }

      // The response is NDJSON — parse each line as it arrives so every
      // signal flips its row live the moment it settles server-side.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: ScanResult | null = null;
      for (;;) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as
            | { type: "signal"; result: SignalResult }
            | { type: "phase"; phase: ScanPhase }
            | { type: "done"; result: ScanResult }
            | { type: "error"; message: string };
          if (ev.type === "signal") {
            setLive((m) => ({ ...m, [ev.result.signal_name]: ev.result }));
          } else if (ev.type === "phase") {
            setPhase(ev.phase);
          } else if (ev.type === "done") {
            finalResult = ev.result;
          } else {
            throw new Error(ev.message);
          }
        }
        if (done) break;
      }
      if (!finalResult) throw new Error("The scan stream ended unexpectedly.");
      setResult(finalResult);
      // Keep the watchlist snapshot fresh if this target is on it.
      updateWatch(finalResult.input.normalized, {
        raw: finalResult.input.raw,
        score: finalResult.score.trust_score,
        band: finalResult.score.risk_band,
        scanned_at: finalResult.scanned_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-8 text-center">
        <BootSequence />
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // multi-signal trust scanner
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_16px_rgba(74,222,128,0.45)] sm:text-3xl">
          CAN I TRUST THIS SELLER?
          <span className="animate-blink text-emerald-400/70">_</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-100/50">
          Paste a website, Instagram handle, or marketplace listing. We combine several
          independent signals into one plain-English trust assessment — no single source
          decides the score.
        </p>
      </header>

      <Panel label="target" className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runScan(input);
          }}
        >
          <label htmlFor="target" className="sr-only">
            URL, Instagram handle, or marketplace listing
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex w-full items-center gap-2 border border-emerald-400/20 bg-black/40 px-3 py-2.5">
              <span className="text-emerald-400/70" aria-hidden>
                &gt;
              </span>
              <input
                id="target"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="example.com, @handle, or a marketplace link…"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-sm text-emerald-100 outline-none placeholder:text-emerald-100/25"
              />
              <kbd
                className="hidden shrink-0 border border-emerald-400/20 px-1.5 py-0.5 text-[10px] text-emerald-100/30 sm:block"
                title='Press "/" to focus'
              >
                /
              </kbd>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 border border-emerald-400/60 bg-emerald-400/10 px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-emerald-300 shadow-[0_0_20px_-6px_rgba(74,222,128,0.6)] transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? "Scanning…" : "Run scan ▶"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-emerald-100/40">
            <span>try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setInput(ex);
                  runScan(ex);
                }}
                className="border border-emerald-400/20 px-2 py-1 text-emerald-300/70 transition hover:border-emerald-400/50 hover:text-emerald-300"
              >
                {ex}
              </button>
            ))}
          </div>
        </form>
      </Panel>

      {error && (
        <div className="mt-6 border border-red-400/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          ! {error}
        </div>
      )}

      {loading && loadingType && (
        <LiveChecks type={loadingType} input={input} live={live} phase={phase} />
      )}

      {result && !loading && (
        <div className="mt-6">
          <ResultsView
            result={result}
            onRescan={() => runScan(result.input.raw, { force: true })}
          />
        </div>
      )}

      {!loading && !result && (
        <>
          <WatchlistPanel
            onRescan={(raw) => {
              setInput(raw);
              runScan(raw, { force: true });
            }}
          />
          <RecentScans />
        </>
      )}

      <footer className="mt-10">
        <Panel className="px-4 py-3 text-center text-xs leading-relaxed text-emerald-100/40">
          <strong className="font-semibold text-emerald-100/70">Informational only.</strong>{" "}
          CredCheck combines public signals to help you make your own judgement. It is{" "}
          <em>not</em> a guarantee of safety or a verdict on any seller. Always use your own
          discretion before paying.
        </Panel>
      </footer>
    </main>
  );
}

/** One-time-per-session boot line, typed out terminal-style. Repeat visits
 *  (and reduced-motion users) get the finished line with no animation, so
 *  layout is identical either way. */
function BootSequence() {
  const signalCount = MODULES.filter((m) => m.built && m.key !== "llm_synthesis").length;
  const full = `> init credcheck :: ${signalCount} signal modules loaded :: ready`;
  const [text, setText] = useState(full);

  useEffect(() => {
    let fresh = false;
    try {
      fresh = !window.sessionStorage.getItem("credcheck.booted");
      if (fresh) window.sessionStorage.setItem("credcheck.booted", "1");
    } catch {
      /* storage disabled — skip the animation */
    }
    if (!fresh || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setText("");
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setText(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 18);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <p className="mb-4 h-4 text-[11px] text-emerald-400/40" aria-hidden>
      {text}
    </p>
  );
}

const STATUS_TAG: Record<SignalResult["status"], { tag: string; cls: string }> = {
  ok: { tag: "[OK]", cls: "text-emerald-400" },
  flag: { tag: "[!!]", cls: "text-amber-400" },
  unavailable: { tag: "[--]", cls: "text-emerald-100/30" },
};

function LiveChecks({
  type,
  input,
  live,
  phase,
}: {
  type: InputType;
  input: string;
  live: Record<string, SignalResult>;
  phase: ScanPhase;
}) {
  const applicable = MODULES.filter((m) => m.appliesTo.includes(type) && m.built);
  const checks = applicable.filter((m) => m.key !== "llm_synthesis");
  const doneCount = checks.filter((m) => live[m.key]).length;

  return (
    <Panel label="status" className="mt-6 p-5">
      <div className="relative mb-4 h-px w-full overflow-hidden bg-emerald-400/10">
        <div className="animate-scan-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
      </div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-xs text-emerald-100/50">
          &gt; target: <span className="text-emerald-300">{input}</span>
        </p>
        <ElapsedTimer />
      </div>
      <p className="mb-4 text-xs text-emerald-100/50">
        &gt; detected: <span className="text-emerald-300">{type}</span> — {doneCount}/
        {checks.length} checks complete
      </p>
      <ul className="space-y-2 text-sm">
        {checks.map((m) => {
          const settled = live[m.key];
          if (!settled) {
            return (
              <li key={m.key} className="flex items-center gap-3 text-emerald-100/80">
                <Spinner /> <span>{m.label}</span>
              </li>
            );
          }
          const ui = STATUS_TAG[settled.status];
          return (
            <li key={m.key} className="flex items-baseline gap-3">
              <span className={`shrink-0 text-xs font-bold ${ui.cls}`}>{ui.tag}</span>
              <span className="text-emerald-100/90">{m.label}</span>
              {typeof settled.duration_ms === "number" && (
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-emerald-100/30">
                  {(settled.duration_ms / 1000).toFixed(2)}s
                </span>
              )}
            </li>
          );
        })}
        <li
          className={`flex items-center gap-3 ${
            phase === "synthesizing" ? "text-emerald-100/80" : "text-emerald-100/30"
          }`}
        >
          {phase === "synthesizing" ? (
            <Spinner />
          ) : (
            <span className="h-3 w-3 shrink-0 border border-dashed border-current" />
          )}
          <span>AI synthesis</span>
          {phase !== "synthesizing" && <span className="ml-auto text-xs">[queued]</span>}
        </li>
      </ul>
    </Panel>
  );
}

function ElapsedTimer() {
  const [tenths, setTenths] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setTenths(Math.floor((Date.now() - started) / 100)), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-[10px] tabular-nums text-emerald-100/30">
      t+{(tenths / 10).toFixed(1)}s
    </span>
  );
}

function Spinner() {
  return (
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
  );
}
