import type { SignalResult } from "@/lib/signals/types";

/**
 * A deterministic, rule-based scorer used until the LLM synthesis step (step 8)
 * is wired in. It intentionally mirrors the LLM's output shape so the API and
 * UI don't change when we swap it out. Its whole job is to prove the
 * "always produce a score, degrade gracefully" requirement end-to-end.
 */

export type RiskBand = "high" | "caution" | "trusted";

export interface ScoreResult {
  trust_score: number; // 0–100
  risk_band: RiskBand;
  /** 0–1: how much signal we actually had to work with */
  confidence: number;
  explanation_bullets: string[];
  data_gaps: string[];
  /** true until the LLM synthesis step replaces this scorer */
  provisional: boolean;
}

function bandFor(score: number): RiskBand {
  if (score >= 70) return "trusted";
  if (score >= 40) return "caution";
  return "high";
}

export function scoreFromSignals(signals: SignalResult[]): ScoreResult {
  // Start neutral; each usable signal nudges the score.
  let score = 55;
  const bullets: string[] = [];
  const gaps: string[] = [];

  let usable = 0;
  for (const s of signals) {
    if (s.status === "unavailable") {
      gaps.push(`${s.label}: ${s.notes}`);
      continue;
    }
    usable += 1;

    if (s.status === "flag") {
      score -= 25;
      bullets.push(`⚠︎ ${s.notes}`);
    } else {
      score += 12;
      bullets.push(`✓ ${s.notes}`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  // Confidence scales with how many signals we could actually use.
  // 7 = every non-synthesis module a website scan can run (see modules-manifest).
  const confidence = Math.min(1, usable / 7);

  if (usable === 0) {
    bullets.push("No trust signals were available for this input yet.");
  }

  return {
    trust_score: Math.round(score),
    risk_band: bandFor(score),
    confidence: Number(confidence.toFixed(2)),
    explanation_bullets: bullets,
    data_gaps: gaps,
    provisional: true,
  };
}
