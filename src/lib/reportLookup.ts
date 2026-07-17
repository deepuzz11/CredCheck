import { prisma } from "@/lib/db/prisma";

/** Shared by /report/[id] and its PDF export route. */
export async function loadReportRow(id: string) {
  try {
    return await prisma.scanCache.findUnique({ where: { id } });
  } catch {
    return null;
  }
}
