"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/scan";
import type { SignalStatus } from "@/lib/signals/types";
import { MODULES } from "@/lib/modules-manifest";
import { Panel } from "@/components/Panel";

interface Slot {
  input: string;
  result: ScanResult | null;
  error: string | null;
  loading: boolean;
}

const MAX_TARGETS = 3;

export default function ComparePage() {
  const [slots, setSlots] = useState<Slot[]>([
    { input: "", result: null, error: null, loading: false },
    { input: "", result: null, error: null, loading: false },
  ]);

  function updateInput(i: number, value: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, input: value } : s)));
  }

  function addSlot() {
    if (slots.length >= MAX_TARGETS) return;
    setSlots((prev) => [...prev, { input: "", result: null, error: null, loading: false }]);
  }

  function removeSlot(i: number) {
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function runCompare() {
    const targets = slots.map((s, i) => ({ i, value: s.input.trim() })).filter((t) => t.value);
    if (targets.length < 2) return;

    setSlots((prev) =>
      prev.map((s) => (s.input.trim() ? { ...s, loading: true, error: null, result: null } : s)),
    );

    await Promise.all(
      targets.map(async ({ i, value }) => {
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: value }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Scan failed.");
          setSlots((prev) =>
            prev.map((slot, idx) => (idx === i ? { ...slot, result: json, loading: false } : slot)),
          );
        } catch (e) {
          setSlots((prev) =>
            prev.map((slot, idx) =>
              idx === i
                ? {
                    ...slot,
                    error: e instanceof Error ? e.message : "Something went wrong.",
                    loading: false,
                  }
                : slot,
            ),
          );
        }
      }),
    );
  }

  const completedResults = slots.filter((s) => s.result).map((s) => s.result!);
  const winner =
    completedResults.length >= 2
      ? completedResults.reduce((best, r) => (r.score.trust_score > best.score.trust_score ? r : best))
      : null;

  const anyLoading = slots.some((s) => s.loading);
  const canCompare = slots.filter((s) => s.input.trim()).length >= 2 && !anyLoading;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // side-by-side
        </p>
        <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_16px_rgba(74,222,128,0.45)]">
          COMPARE SELLERS
        </h1>
        <p className="mt-1 text-sm text-emerald-100/40">
          Scan two or three targets at once and compare scores and signals side by side.
        </p>
      </header>

      <Panel label="targets" className="p-4">
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border border-emerald-400/20 bg-black/40 px-3 py-2"
            >
              <span className="text-emerald-400/70" aria-hidden>
                &gt;
              </span>
              <input
                value={slot.input}
                onChange={(e) => updateInput(i, e.target.value)}
                placeholder={`target ${i + 1}`}
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-sm text-emerald-100 outline-none placeholder:text-emerald-100/25"
              />
              {slots.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="text-xs text-emerald-100/30 hover:text-red-400"
                >
                  [x]
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {slots.length < MAX_TARGETS && (
            <button
              type="button"
              onClick={addSlot}
              className="border border-emerald-400/20 px-3 py-1.5 text-xs text-emerald-300/70 transition hover:border-emerald-400/50 hover:text-emerald-300"
            >
              [ + add another ]
            </button>
          )}
          <button
            type="button"
            onClick={runCompare}
            disabled={!canCompare}
            className="ml-auto border border-emerald-400/60 bg-emerald-400/10 px-6 py-1.5 text-sm uppercase tracking-wide text-emerald-300 shadow-[0_0_20px_-6px_rgba(74,222,128,0.6)] transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {anyLoading ? "comparing…" : "run comparison ▶"}
          </button>
        </div>
      </Panel>

      {slots.some((s) => s.error) && (
        <div className="mt-4 space-y-2">
          {slots.map(
            (s, i) =>
              s.error && (
                <div key={i} className="border border-red-400/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
                  ! {s.input}: {s.error}
                </div>
              ),
          )}
        </div>
      )}

      {completedResults.length >= 2 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-emerald-400/20 px-3 py-2 text-left text-xs uppercase tracking-wider text-emerald-100/40">
                  signal
                </th>
                {slots.map(
                  (s, i) =>
                    s.result && (
                      <th key={i} className="border-b border-emerald-400/20 px-3 py-2 text-left">
                        <span
                          className={`text-xs ${winner === s.result ? "text-emerald-400" : "text-emerald-100/70"}`}
                        >
                          {s.result.input.normalized}
                          {winner === s.result && " 🏆"}
                        </span>
                      </th>
                    ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-emerald-400/10 px-3 py-2 text-emerald-100/50">
                  trust score
                </td>
                {slots.map(
                  (s, i) =>
                    s.result && (
                      <td
                        key={i}
                        className="border-b border-emerald-400/10 px-3 py-2 font-bold tabular-nums text-emerald-300"
                      >
                        {s.result.score.trust_score}/100
                      </td>
                    ),
                )}
              </tr>
              <tr>
                <td className="border-b border-emerald-400/10 px-3 py-2 text-emerald-100/50">
                  risk band
                </td>
                {slots.map(
                  (s, i) =>
                    s.result && (
                      <td
                        key={i}
                        className="border-b border-emerald-400/10 px-3 py-2 uppercase text-emerald-100/70"
                      >
                        {s.result.score.risk_band}
                      </td>
                    ),
                )}
              </tr>
              {MODULES.filter((m) => m.key !== "llm_synthesis").map((m) => (
                <tr key={m.key}>
                  <td className="border-b border-emerald-400/10 px-3 py-2 text-emerald-100/50">
                    {m.label}
                  </td>
                  {slots.map((s, i) => {
                    if (!s.result) return null;
                    const signal = s.result.signals.find((sig) => sig.signal_name === m.key);
                    return (
                      <td key={i} className="border-b border-emerald-400/10 px-3 py-2">
                        {signal ? (
                          <StatusTag status={signal.status} />
                        ) : (
                          <span className="text-emerald-100/20">n/a</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function StatusTag({ status }: { status: SignalStatus }) {
  const map: Record<SignalStatus, { text: string; cls: string }> = {
    ok: { text: "[OK]", cls: "text-emerald-400" },
    flag: { text: "[!!]", cls: "text-amber-400" },
    unavailable: { text: "[--]", cls: "text-emerald-100/25" },
  };
  const s = map[status];
  return <span className={s.cls}>{s.text}</span>;
}
