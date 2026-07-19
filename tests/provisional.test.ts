import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreFromSignals } from "../src/lib/score/provisional";
import { MODULES } from "../src/lib/modules-manifest";
import type { SignalResult } from "../src/lib/signals/types";

/** Full confidence = every non-synthesis module a website scan can run. */
const FULL_SIGNAL_COUNT = MODULES.filter(
  (m) => m.built && m.key !== "llm_synthesis" && m.appliesTo.includes("website"),
).length;

function sig(status: SignalResult["status"], name = "x"): SignalResult {
  return { signal_name: name, label: name, status, data: {}, notes: `${name} ${status}` };
}

test("no signals → neutral-ish score, zero confidence, explanatory bullet", () => {
  const r = scoreFromSignals([]);
  assert.equal(r.confidence, 0);
  assert.equal(r.provisional, true);
  assert.ok(r.explanation_bullets.length > 0);
});

test("a full slate of ok signals → trusted with full confidence", () => {
  const r = scoreFromSignals(
    Array.from({ length: FULL_SIGNAL_COUNT }, (_, i) => sig("ok", `s${i}`)),
  );
  assert.ok(r.trust_score >= 70, `score ${r.trust_score}`);
  assert.equal(r.risk_band, "trusted");
  assert.equal(r.confidence, 1);
});

test("flags pull the score down harder than oks pull up", () => {
  const flagged = scoreFromSignals([sig("ok", "a"), sig("flag", "b")]);
  const clean = scoreFromSignals([sig("ok", "a"), sig("ok", "b")]);
  assert.ok(flagged.trust_score < clean.trust_score);
});

test("many flags clamp at 0 and band high", () => {
  const r = scoreFromSignals(Array.from({ length: 6 }, (_, i) => sig("flag", `f${i}`)));
  assert.equal(r.trust_score, 0);
  assert.equal(r.risk_band, "high");
});

test("unavailable signals become data gaps and lower confidence", () => {
  const r = scoreFromSignals([sig("ok", "a"), sig("unavailable", "b")]);
  assert.equal(r.data_gaps.length, 1);
  assert.ok(r.confidence < 1);
});

test("band thresholds: 70 trusted, 40 caution, below 40 high", () => {
  // Constructed indirectly: bands must be consistent with the returned score.
  for (const count of [0, 1, 2, 3, 4, 5]) {
    const r = scoreFromSignals([
      ...Array.from({ length: count }, (_, i) => sig("flag", `f${i}`)),
      sig("ok", "k"),
    ]);
    const expected = r.trust_score >= 70 ? "trusted" : r.trust_score >= 40 ? "caution" : "high";
    assert.equal(r.risk_band, expected);
  }
});
