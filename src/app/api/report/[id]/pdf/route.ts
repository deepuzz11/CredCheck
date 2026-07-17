import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { loadReportRow } from "@/lib/reportLookup";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/report/[id]/pdf — renders the print-friendly view of a report
 * (/report/[id]?print=1, see PrintableReport.tsx) with a headless browser
 * and returns it as a downloadable PDF. Reuses Playwright, already a
 * dependency for the site-fingerprinting signal.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`pdf:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many PDF exports — please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  const { id } = await params;
  const row = await loadReportRow(id);
  if (!row) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This report has expired." }, { status: 410 });
  }

  const origin = new URL(request.url).origin;
  const printUrl = `${origin}/report/${id}?print=1`;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle", timeout: 15000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    const filename = `credcheck-${row.normalizedKey.replace(/[^a-z0-9.-]/gi, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[/api/report/[id]/pdf] render failed:", err);
    return NextResponse.json({ error: "Couldn't generate the PDF. Please try again." }, { status: 500 });
  } finally {
    await browser.close();
  }
}
