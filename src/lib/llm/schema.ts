import { z } from "zod";

/**
 * The shape every LLM provider must return, validated before it's trusted.
 * Mirrors `ScoreResult` (minus the `provisional` flag, which callers add).
 */
export const LlmOutputSchema = z.object({
  trust_score: z.number().min(0).max(100),
  risk_band: z.enum(["high", "caution", "trusted"]),
  explanation_bullets: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
  data_gaps: z.array(z.string()),
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

/** Pulls the first {...} block out of text that may contain surrounding prose. */
export function extractJsonObject(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
