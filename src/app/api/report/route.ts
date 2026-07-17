import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { detectAndNormalize, InputDetectionError } from "@/lib/input/detect";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  target: z.string().min(1, "Target is required").max(2048),
  reason: z.string().max(500).optional(),
});

/**
 * Step (report a scam) — lets a user flag a target as a scam. Stored as an
 * unverified, crowd-sourced report (ScamReport table), separate from the
 * curated blocklist, and picked up by the scam_reports signal on future
 * scans of the same target (src/lib/signals/scamReports.ts).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`report:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many reports from this address — please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Reporting requires the database to be configured (DATABASE_URL)." },
      { status: 503 },
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
    const normalized = detectAndNormalize(parsed.data.target);
    const target = (normalized.domain ?? normalized.handle ?? "").toLowerCase();
    if (!target) {
      return NextResponse.json(
        { error: "Couldn't determine a domain or handle to report from that input." },
        { status: 400 },
      );
    }

    const report = await prisma.scamReport.create({
      data: {
        target,
        targetType: normalized.type,
        reason: parsed.data.reason?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, id: report.id }, { status: 201 });
  } catch (err) {
    if (err instanceof InputDetectionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[/api/report] unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong submitting the report. Please try again." },
      { status: 500 },
    );
  }
}
