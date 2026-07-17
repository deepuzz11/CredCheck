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

/** Returns the cache row's id (for permalinks), or null if caching is unavailable. */
export async function setCachedScan(
  normalizedKey: string,
  inputType: string,
  result: ScanResult,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
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
