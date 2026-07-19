import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";

/**
 * Step 9 — result caching, keyed by normalized domain/handle, 48h TTL.
 * Also the backing store for shareable /report/[id] permalinks — the cache
 * row's id is attached to the returned ScanResult as `id`.
 *
 * Caching is an optimization, not a dependency: if there's no DATABASE_URL,
 * or the database is unreachable, both functions fail soft (log + return/no-op)
 * so a scan always completes — the same "never crash the scan" contract every
 * signal module follows.
 */

const TTL_MS = 48 * 60 * 60 * 1000;

export async function getCachedScan(normalizedKey: string): Promise<ScanResult | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const row = await prisma.scanCache.findUnique({ where: { normalizedKey } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return { ...(row.resultJson as unknown as ScanResult), id: row.id };
  } catch (err) {
    console.warn(
      "[cache] read failed, proceeding without cache:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** How many past scores back the trend sparkline reaches. */
const TREND_LIMIT = 12;

/**
 * Persist a completed scan: append a slim ScanHistory row (the timeline),
 * then upsert the full result into the cache (the latest snapshot).
 *
 * Before writing, it reads the previous history row and score timeline and
 * mutates `result` with `previous` + `trend` — so the delta chip and the
 * sparkline are baked into the stored JSON, consistent with the scan's own
 * point in time. Returns the cache row's id (for permalinks), or null when
 * persistence is unavailable.
 */
export async function setCachedScan(
  normalizedKey: string,
  inputType: string,
  result: ScanResult,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const past = await prisma.scanHistory.findMany({
      where: { normalizedKey },
      orderBy: { createdAt: "desc" },
      take: TREND_LIMIT - 1,
    });
    const latest = past[0];
    result.previous = latest
      ? {
          trust_score: latest.trustScore,
          risk_band: latest.riskBand,
          scanned_at: latest.createdAt.toISOString(),
        }
      : null;
    result.trend = [...past.map((h) => h.trustScore).reverse(), result.score.trust_score];

    await prisma.scanHistory.create({
      data: {
        normalizedKey,
        inputType,
        trustScore: result.score.trust_score,
        riskBand: result.score.risk_band,
        confidence: result.score.confidence,
      },
    });

    const expiresAt = new Date(Date.now() + TTL_MS);
    const resultJson = result as unknown as Prisma.InputJsonValue;
    const row = await prisma.scanCache.upsert({
      where: { normalizedKey },
      create: { normalizedKey, inputType, resultJson, expiresAt },
      update: { inputType, resultJson, expiresAt, createdAt: new Date() },
    });
    return row.id;
  } catch (err) {
    console.warn(
      "[cache] write failed, result not cached:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
