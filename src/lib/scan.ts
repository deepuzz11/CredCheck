import { detectAndNormalize, type NormalizedInput } from "@/lib/input/detect";
import { checkDomainAge } from "@/lib/signals/whois";
import { checkSslCertificate } from "@/lib/signals/ssl";
import { checkDnsHealth } from "@/lib/signals/dnsHealth";
import { fingerprintSite, type FingerprintData } from "@/lib/signals/fingerprint";
import { checkContactConsistency } from "@/lib/signals/contactConsistency";
import { checkReviewSentiment } from "@/lib/signals/reviewSentiment";
import { checkScamReports } from "@/lib/signals/scamReports";
import { checkLookalikeDomain, checkLookalikeHandle } from "@/lib/signals/lookalike";
import { checkRedirectChain } from "@/lib/signals/redirects";
import type { SignalResult } from "@/lib/signals/types";
import type { ScoreResult } from "@/lib/score/provisional";
import { synthesizeScore } from "@/lib/llm/synthesize";

/**
 * The scan orchestrator. Independently-callable signal modules run in
 * parallel where they can; `contact_consistency` depends on the fingerprint
 * result so it runs once that settles. `runSignal` (in each module) means
 * none of these promises reject, so `Promise.all` can never throw here —
 * one dead source can never crash the scan.
 *
 * Callers that want live progress (the /api/scan/stream route) pass
 * `onEvent`; it fires as each signal settles and when synthesis starts.
 * Plain `runScan(input)` behaves exactly as before.
 */

export interface ScanResult {
  input: NormalizedInput;
  scanned_at: string;
  signals: SignalResult[];
  score: ScoreResult;
  /** JPEG thumbnail of the homepage at scan time (websites only) — lifted out
   *  of the fingerprint signal so the LLM prompt never carries the blob */
  screenshot_data_url?: string | null;
  /** the immediately preceding scan of this target, when history is enabled —
   *  powers the "score changed since last scan" delta chip */
  previous?: { trust_score: number; risk_band: string; scanned_at: string } | null;
  /** recent score timeline (oldest → newest, this scan last) — the sparkline */
  trend?: number[];
  /** true when served from the 48h cache instead of freshly scanned */
  cached: boolean;
  /** cache row id — present only when caching is enabled; powers /report/[id] permalinks */
  id?: string;
}

export type ScanProgressEvent =
  | { type: "signal"; result: SignalResult }
  | { type: "phase"; phase: "synthesizing" };

export interface RunScanOptions {
  onEvent?: (event: ScanProgressEvent) => void;
}

export async function runScan(rawInput: string, opts: RunScanOptions = {}): Promise<ScanResult> {
  const input = detectAndNormalize(rawInput);
  const emit = opts.onEvent ?? (() => {});

  // Emits a progress event the moment a signal settles, without changing
  // the promise's value — the parallel structure stays exactly as it was.
  const track = <T extends SignalResult>(job: Promise<T>): Promise<T> =>
    job.then((result) => {
      emit({ type: "signal", result });
      return result;
    });

  const jobs: Promise<SignalResult>[] = [];

  if (input.domain) {
    jobs.push(track(checkDomainAge(input.domain)));
    jobs.push(track(checkSslCertificate(input.domain)));
    jobs.push(track(checkDnsHealth(input.domain)));
  }

  if (input.type === "website" && input.domain) {
    jobs.push(track(checkLookalikeDomain(input.domain)));
  } else if (input.type === "instagram" && input.handle) {
    jobs.push(track(checkLookalikeHandle(input.handle)));
  }

  let fingerprintJob: Promise<SignalResult<FingerprintData>> | null = null;
  if (input.type === "website" && input.url) {
    jobs.push(track(checkRedirectChain(input.url)));
    fingerprintJob = track(fingerprintSite(input.url));
    jobs.push(fingerprintJob);
  }

  jobs.push(
    track(
      checkReviewSentiment({
        normalizedKey: input.normalized,
        domain: input.domain,
        handle: input.handle,
      }),
    ),
  );
  jobs.push(track(checkScamReports({ domain: input.domain, handle: input.handle })));

  const signals = await Promise.all(jobs);

  // Contact consistency depends on fingerprint output, so it runs after
  // (the promise above is already settled — this just reads its result).
  if (fingerprintJob && input.domain) {
    const fpResult = await fingerprintJob;
    const fpData = fpResult.status === "unavailable" ? null : fpResult.data;
    signals.push(await track(checkContactConsistency(input.domain, fpData)));
  }

  // Lift the screenshot blob out of the fingerprint signal before synthesis:
  // the LLM prompt serializes signal data verbatim, and a ~100KB base64
  // string in the prompt would be pure noise (and cost).
  let screenshot: string | null = null;
  const fp = signals.find((s) => s.signal_name === "site_fingerprint");
  if (fp?.data && typeof fp.data.screenshot_data_url === "string") {
    screenshot = fp.data.screenshot_data_url;
    delete fp.data.screenshot_data_url;
  }

  emit({ type: "phase", phase: "synthesizing" });

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
    screenshot_data_url: screenshot,
    cached: false,
  };
}
