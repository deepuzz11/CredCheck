"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ScanResult } from "@/lib/scan";
import { MODULES } from "@/lib/modules-manifest";
import { detectAndNormalize, type InputType } from "@/lib/input/detect";
import { ResultsView } from "@/components/ResultsView";
import { Panel } from "@/components/Panel";

const EXAMPLES = ["example.com", "@nike", "amazon.com/dp/B08N5WRWNW"];

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ScanApp />
    </Suspense>
  );
}

function ScanApp() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<InputType | null>(null);
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

  async function runScan(value: string, opts?: { force?: boolean }) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    setResult(null);

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
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed, force: opts?.force ?? false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Scan failed.");
      setResult(json as ScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-8 text-center">
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
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="example.com, @handle, or a marketplace link…"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-sm text-emerald-100 outline-none placeholder:text-emerald-100/25"
              />
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

      {loading && loadingType && <LoadingChecks type={loadingType} input={input} />}

      {result && !loading && (
        <div className="mt-6">
          <ResultsView
            result={result}
            onRescan={() => runScan(result.input.raw, { force: true })}
          />
        </div>
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

function LoadingChecks({ type, input }: { type: InputType; input: string }) {
  const applicable = MODULES.filter((m) => m.appliesTo.includes(type));
  const built = applicable.filter((m) => m.built);
  const pending = applicable.filter((m) => !m.built);
  return (
    <Panel label="status" className="mt-6 overflow-hidden p-5">
      <div className="relative mb-4 h-px w-full overflow-hidden bg-emerald-400/10">
        <div className="animate-scan-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
      </div>
      <p className="mb-1 text-xs text-emerald-100/50">
        &gt; target: <span className="text-emerald-300">{input}</span>
      </p>
      <p className="mb-4 text-xs text-emerald-100/50">
        &gt; detected: <span className="text-emerald-300">{type}</span> — running checks...
      </p>
      <ul className="space-y-2 text-sm">
        {built.map((m) => (
          <li key={m.key} className="flex items-center gap-3 text-emerald-100/80">
            <Spinner /> <span>{m.label}</span>
          </li>
        ))}
        {pending.map((m) => (
          <li key={m.key} className="flex items-center gap-3 text-emerald-100/25">
            <span className="h-3 w-3 border border-dashed border-current" />
            <span>{m.label}</span>
            <span className="ml-auto text-xs">[pending]</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Spinner() {
  return (
    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
  );
}
