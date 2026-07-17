import { detectAndNormalize, type NormalizedInput } from "@/lib/input/detect";
import { checkDomainAge } from "@/lib/signals/whois";
import { checkSslCertificate } from "@/lib/signals/ssl";
import { fingerprintSite, type FingerprintData } from "@/lib/signals/fingerprint";
import { checkContactConsistency } from "@/lib/signals/contactConsistency";
import { checkReviewSentiment } from "@/lib/signals/reviewSentiment";
import { checkScamReports } from "@/lib/signals/scamReports";
import type { SignalResult } from "@/lib/signals/types";
import type { ScoreResult } from "@/lib/score/provisional";
import { synthesizeScore } from "@/lib/llm/synthesize";

/**
 * The scan orchestrator. Independently-callable signal modules run in
 * parallel where they can; `contact_consistency` depends on the fingerprint
 * result so it runs once that settles. `runSignal` (in each module) means
 * none of these promises reject, so `Promise.all` can never throw here —
 * one dead source can never crash the scan.
 */

export interface ScanResult {
  input: NormalizedInput;
  scanned_at: string;
  signals: SignalResult[];
  score: ScoreResult;
  /** true when served from the 48h cache instead of freshly scanned */
  cached: boolean;
  /** cache row id — present only when caching is enabled; powers /report/[id] permalinks */
  id?: string;
}

export async function runScan(rawInput: string): Promise<ScanResult> {
  const input = detectAndNormalize(rawInput);

  const jobs: Promise<SignalResult>[] = [];

  if (input.domain) {
    jobs.push(checkDomainAge(input.domain));
    jobs.push(checkSslCertificate(input.domain));
  }

  let fingerprintJob: Promise<SignalResult<FingerprintData>> | null = null;
  if (input.type === "website" && input.url) {
    fingerprintJob = fingerprintSite(input.url);
    jobs.push(fingerprintJob);
  }

  jobs.push(
    checkReviewSentiment({
      normalizedKey: input.normalized,
      domain: input.domain,
      handle: input.handle,
    }),
  );
  jobs.push(checkScamReports({ domain: input.domain, handle: input.handle }));

  const signals = await Promise.all(jobs);

  // Contact consistency depends on fingerprint output, so it runs after
  // (the promise above is already settled — this just reads its result).
  if (fingerprintJob && input.domain) {
    const fpResult = await fingerprintJob;
    const fpData = fpResult.status === "unavailable" ? null : fpResult.data;
    signals.push(await checkContactConsistency(input.domain, fpData));
  }

  const score = await synthesizeScore({
    inputType: input.type,
    normalizedKey: input.normalized,
    signals,
  });

  return {
    input,
    scanned_at: new Date().toISOString(),
    signals,
    score,
    cached: false,
  };
}
