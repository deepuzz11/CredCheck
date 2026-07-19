import { NextResponse } from "next/server";
import { z } from "zod";
import { runScan } from "@/lib/scan";
import { detectAndNormalize, InputDetectionError } from "@/lib/input/detect";
import { getCachedScan, setCachedScan } from "@/lib/cache/scanCache";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Streaming variant of /api/scan. Same contract, but the response is
 * newline-delimited JSON that arrives as the scan actually progresses:
 *
 *   {"type":"signal","result":{...SignalResult}}   ← one per settled signal
 *   {"type":"phase","phase":"synthesizing"}        ← all signals in, LLM running
 *   {"type":"done","result":{...ScanResult}}       ← always the last line
 *   {"type":"error","message":"..."}               ← terminal, replaces "done"
 *
 * Cached hits skip straight to the "done" line. The classic JSON endpoint
 * remains at /api/scan for programmatic use — both share one rate-limit
 * bucket, so streaming doesn't grant extra scans.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  input: z.string().min(1, "Input is required").max(2048),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`scan:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many scans from this address — please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Validate the input before committing to a 200 streaming response —
  // bad input should be an ordinary 400, not a mid-stream error line.
  let normalizedKey: string;
  let inputType: string;
  try {
    const normalized = detectAndNormalize(parsed.data.input);
    normalizedKey = normalized.normalized;
    inputType = normalized.type;
  } catch (err) {
    if (err instanceof InputDetectionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const { input, force } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true; // client went away — keep scanning, stop writing
        }
      };

      try {
        if (!force) {
          const cached = await getCachedScan(normalizedKey);
          if (cached) {
            send({ type: "done", result: { ...cached, cached: true } });
            controller.close();
            return;
          }
        }

        const result = await runScan(input, { onEvent: send });
        const id = await setCachedScan(normalizedKey, inputType, result);
        if (id) result.id = id;

        send({ type: "done", result });
      } catch (err) {
        console.error("[/api/scan/stream] unexpected error:", err);
        send({
          type: "error",
          message: "Something went wrong running the scan. Please try again.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Defeats proxy buffering (nginx et al.) so lines arrive live.
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
