import { LlmOutputSchema, extractJsonObject } from "./schema";
import { buildSynthesisPrompt } from "./prompt";
import type { LlmProvider, SynthesisContext } from "./provider";

const OLLAMA_TIMEOUT_MS = 30000;

/** Free, local, open-source — the default LLM path (https://ollama.com). */
export function createOllamaProvider(baseUrl: string, model: string): LlmProvider {
  return {
    name: `ollama:${model}`,
    async synthesize(ctx: SynthesisContext) {
      const prompt = buildSynthesisPrompt(ctx);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
      try {
        const res = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            format: "json",
            stream: false,
            options: { temperature: 0.2 },
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Ollama responded ${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as { response?: string };
        if (!json.response) throw new Error("Ollama response had no `response` field.");

        const parsed = LlmOutputSchema.parse(JSON.parse(extractJsonObject(json.response)));
        return { ...parsed, provisional: false };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
