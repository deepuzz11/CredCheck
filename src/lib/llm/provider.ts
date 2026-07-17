import type { SignalResult } from "@/lib/signals/types";
import type { ScoreResult } from "@/lib/score/provisional";

export interface SynthesisContext {
  inputType: "website" | "instagram" | "marketplace";
  normalizedKey: string;
  signals: SignalResult[];
}

export interface LlmProvider {
  name: string;
  synthesize(ctx: SynthesisContext): Promise<ScoreResult>;
}
