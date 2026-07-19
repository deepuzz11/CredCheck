import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";

/**
 * The last few unexpired scans, trimmed to chip-sized facts — powers the
 * "recent activity" strip on the home page and gives first-time visitors
 * something clickable. Returns an empty list when caching isn't configured,
 * same fail-soft contract as the cache itself.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RecentScan {
  id: string;
  key: string;
  input_type: string;
  trust_score: number;
  risk_band: string;
  scanned_at: string;
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ scans: [] });
  }
  try {
    const rows = await prisma.scanCache.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const scans: RecentScan[] = rows.map((row) => {
      const result = row.resultJson as unknown as ScanResult;
      return {
        id: row.id,
        key: row.normalizedKey,
        input_type: row.inputType,
        trust_score: result.score?.trust_score ?? 0,
        risk_band: result.score?.risk_band ?? "caution",
        scanned_at: row.createdAt.toISOString(),
      };
    });
    return NextResponse.json({ scans }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.warn("[/api/recent] read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ scans: [] });
  }
}
