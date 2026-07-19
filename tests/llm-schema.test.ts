import { test } from "node:test";
import assert from "node:assert/strict";
import { LlmOutputSchema, extractJsonObject } from "../src/lib/llm/schema";

test("extractJsonObject pulls the JSON block out of surrounding prose", () => {
  const raw = 'Sure! Here is the result:\n{"trust_score": 40}\nHope that helps.';
  assert.equal(extractJsonObject(raw), '{"trust_score": 40}');
});

test("extractJsonObject returns input unchanged when no braces exist", () => {
  assert.equal(extractJsonObject("no json here"), "no json here");
});

test("schema accepts a well-formed LLM answer", () => {
  const parsed = LlmOutputSchema.parse({
    trust_score: 62,
    risk_band: "caution",
    explanation_bullets: ["Domain is 2 months old."],
    confidence: 0.7,
    data_gaps: [],
  });
  assert.equal(parsed.risk_band, "caution");
});

test("schema rejects out-of-range scores, bad bands, empty bullets", () => {
  const base = {
    trust_score: 50,
    risk_band: "caution",
    explanation_bullets: ["x"],
    confidence: 0.5,
    data_gaps: [],
  };
  assert.throws(() => LlmOutputSchema.parse({ ...base, trust_score: 101 }));
  assert.throws(() => LlmOutputSchema.parse({ ...base, risk_band: "unknown" }));
  assert.throws(() => LlmOutputSchema.parse({ ...base, explanation_bullets: [] }));
  assert.throws(() => LlmOutputSchema.parse({ ...base, confidence: 1.5 }));
});
