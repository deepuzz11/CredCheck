import type { LlmProvider, SynthesisContext } from "./provider";
import { scoreFromSignals } from "@/lib/score/provisional";

/** Always-available fallback — zero network calls, zero keys. */
export const ruleBasedProvider: LlmProvider = {
  name: "rule_based",
  async synthesize(ctx: SynthesisContext) {
    return scoreFromSignals(ctx.signals);
  },
};
