import type { SynthesisContext } from "./provider";

/**
 * Step 8's core requirement: the model must be explicit about what data was
 * missing rather than guessing. Rules 2 and 3 below exist specifically for
 * that; everything else keeps the model anchored to the provided signals
 * instead of its own priors about "example.com" or "@nike".
 */
export function buildSynthesisPrompt(ctx: SynthesisContext): string {
  const signalsJson = JSON.stringify(ctx.signals, null, 2);

  return `You are a trust-and-safety analyst helping a shopper decide whether an online seller is trustworthy.

You will be given a JSON array of independently-gathered "trust signals" for a single target (a website, Instagram handle, or marketplace listing). Each signal has:
- signal_name, label
- status: "ok" (gathered successfully, looks normal), "flag" (gathered successfully, looks suspicious), or "unavailable" (we couldn't get this data)
- data: the structured payload
- notes: a short explanation

Target type: ${ctx.inputType}
Target: ${ctx.normalizedKey}

Signals:
${signalsJson}

Your task: synthesize these into ONE overall trust assessment. Rules:
1. Base your assessment ONLY on the signals provided. Do not invent facts about this seller beyond what's in the data, even if you recognize the name.
2. For every signal with status "unavailable", list it (in your own words) under data_gaps. Do NOT guess what it might have shown, and do NOT silently drop it either.
3. confidence must be LOWER when many signals are unavailable, even if the signals you do have look good. A high score built on 1 of 6 signals should carry markedly lower confidence than the same score built on 6 of 6.
4. risk_band: "high" for trust_score < 40, "caution" for 40-69, "trusted" for 70+.
5. explanation_bullets should be short, plain-English, and each should reference what was actually observed (e.g. "Domain registered only 12 days ago" rather than "domain looks new").
6. Weight "flag" signals heavily — risk signals (new domain, broken/missing SSL, missing email DNS, missing policies, blocklist match, mismatched contact email, suspiciously uniform reviews, a domain/handle that imitates a well-known brand, a link hidden behind a URL shortener or a cross-domain redirect chain) should pull the score down more than the mere absence of positive signals pulls it up.

Respond with ONLY a JSON object, no prose before or after, matching exactly this shape:
{
  "trust_score": <integer 0-100>,
  "risk_band": "high" | "caution" | "trusted",
  "explanation_bullets": [<string>, ...],
  "confidence": <number 0-1>,
  "data_gaps": [<string>, ...]
}`;
}
