import { LlmOutputSchema, extractJsonObject } from "./schema";
import { buildSynthesisPrompt } from "./prompt";
import type { LlmProvider, SynthesisContext } from "./provider";

const ANTHROPIC_TIMEOUT_MS = 30000;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Optional, paid path. Only used if the operator explicitly sets
 * LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY — off by default so the app
 * runs on free tools out of the box (see ollamaProvider.ts / the "none"
 * rule-based fallback).
 */
export function createAnthropicProvider(
  apiKey: string,
  model = "claude-sonnet-5",
): LlmProvider {
  return {
    name: `anthropic:${model}`,
    async synthesize(ctx: SynthesisContext) {
      const prompt = buildSynthesisPrompt(ctx);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
      try {
        const res = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Anthropic API responded ${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const text = json.content?.find((b) => b.type === "text")?.text ?? "";
        if (!text) throw new Error("Anthropic response had no text content.");

        const parsed = LlmOutputSchema.parse(JSON.parse(extractJsonObject(text)));
        return { ...parsed, provisional: false };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
