/**
 * Every trust-signal module returns this exact shape so the synthesis step
 * (and the UI) can treat them uniformly. This is the contract referenced in
 * the MVP requirements.
 *
 *  - status: 'ok'         → we successfully gathered the signal
 *            'unavailable' → the source didn't return data (degrade gracefully)
 *            'flag'        → we got data AND it looks suspicious
 */
export type SignalStatus = "ok" | "unavailable" | "flag";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SignalResult<TData = any> {
  /** stable machine name, e.g. "domain_age" */
  signal_name: string;
  /** human-friendly label for the UI, e.g. "Domain age & WHOIS" */
  label: string;
  status: SignalStatus;
  /** the structured payload this signal produced (shape is per-module) */
  data: TData;
  /** short plain-English note explaining the status */
  notes: string;
  /** how long the module took, in ms (useful for the UI + debugging) */
  duration_ms?: number;
}

/**
 * Helper so modules never throw into the scan pipeline. Wrap the actual work;
 * on any error we return a well-formed `unavailable` result instead of
 * crashing the whole scan.
 */
export async function runSignal<TData>(
  meta: { signal_name: string; label: string },
  fn: () => Promise<Omit<SignalResult<TData>, "signal_name" | "label" | "duration_ms">>,
): Promise<SignalResult<TData>> {
  const started = Date.now();
  try {
    const partial = await fn();
    return {
      signal_name: meta.signal_name,
      label: meta.label,
      duration_ms: Date.now() - started,
      ...partial,
    };
  } catch (err) {
    return {
      signal_name: meta.signal_name,
      label: meta.label,
      status: "unavailable",
      data: {} as TData,
      notes: `Signal failed: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - started,
    };
  }
}
