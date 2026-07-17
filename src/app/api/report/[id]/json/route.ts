import { NextResponse } from "next/server";
import { loadReportRow } from "@/lib/reportLookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/report/[id]/json — the raw ScanResult as a downloadable JSON file,
 * for anyone who wants to archive a scan or feed it into their own tooling.
 * Same lookup + expiry rules as the report page and PDF export; no rate limit
 * needed — it's a single cheap DB read, same cost as viewing the report.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadReportRow(id);
  if (!row) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This report has expired." }, { status: 410 });
  }

  const filename = `credcheck-${row.normalizedKey.replace(/[^a-z0-9.-]/gi, "_")}.json`;
  return new NextResponse(JSON.stringify({ id: row.id, ...(row.resultJson as object) }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
