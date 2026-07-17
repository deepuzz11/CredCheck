import { NextResponse } from "next/server";
import { z } from "zod";
import { runScan } from "@/lib/scan";
import { detectAndNormalize, InputDetectionError } from "@/lib/input/detect";
import { getCachedScan, setCachedScan } from "@/lib/cache/scanCache";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Playwright + whoiser open real sockets/processes — force the Node.js runtime.
export const runtime = "nodejs";
// This route is fully dynamic; never cache the response at the framework level
// (our own 48h Postgres cache below is the intentional caching layer).
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  input: z.string().min(1, "Input is required").max(2048),
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

  try {
    const normalized = detectAndNormalize(parsed.data.input);

    const cached = await getCachedScan(normalized.normalized);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true }, { status: 200 });
    }

    const result = await runScan(parsed.data.input);
    const id = await setCachedScan(normalized.normalized, normalized.type, result);
    if (id) result.id = id;

    return NextResponse.json(result, {
      status: 200,
      headers: { "X-RateLimit-Remaining": String(rate.remaining) },
    });
  } catch (err) {
    if (err instanceof InputDetectionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[/api/scan] unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong running the scan. Please try again." },
      { status: 500 },
    );
  }
}
