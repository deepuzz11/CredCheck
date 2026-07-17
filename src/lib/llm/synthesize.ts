import type { ScoreResult } from "@/lib/score/provisional";
import type { SynthesisContext } from "./provider";
import { ruleBasedProvider } from "./ruleBasedProvider";
import { createOllamaProvider } from "./ollamaProvider";
import { createAnthropicProvider } from "./anthropicProvider";

/**
 * Step 8's entry point. Provider-agnostic and fails safe: if the configured
 * LLM is unreachable, misconfigured, or returns something that doesn't match
 * the schema, we fall back to the deterministic rule-based scorer rather than
 * failing the scan — the same "degrade gracefully" contract every signal
 * module follows.
 */
export async function synthesizeScore(ctx: SynthesisContext): Promise<ScoreResult> {
  const providerName = (process.env.LLM_PROVIDER ?? "none").toLowerCase();

  if (providerName === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL ?? "llama3.1";
    try {
      return await createOllamaProvider(baseUrl, model).synthesize(ctx);
    } catch (err) {
      return fallbackWithNote(
        ctx,
        `AI synthesis via Ollama (${model} at ${baseUrl}) was unavailable (${errMsg(err)}); used rule-based scoring instead.`,
      );
    }
  }

  if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return fallbackWithNote(
        ctx,
        "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set; used rule-based scoring instead.",
      );
    }
    try {
      return await createAnthropicProvider(apiKey).synthesize(ctx);
    } catch (err) {
      return fallbackWithNote(
        ctx,
        `AI synthesis via Anthropic was unavailable (${errMsg(err)}); used rule-based scoring instead.`,
      );
    }
  }

  return ruleBasedProvider.synthesize(ctx);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fallbackWithNote(ctx: SynthesisContext, note: string): Promise<ScoreResult> {
  const result = await ruleBasedProvider.synthesize(ctx);
  return { ...result, data_gaps: [note, ...result.data_gaps] };
}
