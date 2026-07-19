"use client";

import type { ScanResult } from "@/lib/scan";
import type { SignalResult } from "@/lib/signals/types";

/**
 * Client half of the /api/scan/stream contract: POSTs the target, parses the
 * NDJSON event stream, fires callbacks as signals settle, and resolves with
 * the final ScanResult. One parser shared by the home scanner and /batch.
 */

export type ScanPhase = "signals" | "synthesizing";

export interface StreamScanOptions {
  force?: boolean;
  onSignal?: (result: SignalResult) => void;
  onPhase?: (phase: ScanPhase) => void;
}

export async function streamScan(
  input: string,
  { force = false, onSignal, onPhase }: StreamScanOptions = {},
): Promise<ScanResult> {
  const res = await fetch("/api/scan/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, force }),
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? "Scan failed.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ScanResult | null = null;
  for (;;) {
    const { done, value: chunk } = await reader.read();
    buffer += decoder.decode(chunk, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as
        | { type: "signal"; result: SignalResult }
        | { type: "phase"; phase: ScanPhase }
        | { type: "done"; result: ScanResult }
        | { type: "error"; message: string };
      if (ev.type === "signal") onSignal?.(ev.result);
      else if (ev.type === "phase") onPhase?.(ev.phase);
      else if (ev.type === "done") finalResult = ev.result;
      else throw new Error(ev.message);
    }
    if (done) break;
  }
  if (!finalResult) throw new Error("The scan stream ended unexpectedly.");
  return finalResult;
}
