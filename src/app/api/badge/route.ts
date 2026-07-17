import { prisma } from "@/lib/db/prisma";
import type { ScanResult } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Embeddable trust badge — GET /api/badge?key=<normalizedKey>
 *
 * Returns a small SVG image a seller can put on their own site
 * (`<img src="…">`), always reflecting the latest cached scan for that
 * target (keyed the same way as the 48h scan cache, so it naturally goes
 * stale/refreshes with it — no separate badge cache to keep in sync).
 */

const BAND_COLOR: Record<string, string> = {
  trusted: "#4ade80",
  caution: "#fbbf24",
  high: "#f87171",
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function renderBadge(opts: { label: string; value: string; color: string }): string {
  const { label, value, color } = opts;
  const labelWidth = 78;
  const valueWidth = 62;
  const width = labelWidth + valueWidth;
  const height = 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <rect width="${width}" height="${height}" fill="#05070a" stroke="${color}" stroke-opacity="0.5"/>
  <line x1="${labelWidth}" y1="0" x2="${labelWidth}" y2="${height}" stroke="${color}" stroke-opacity="0.3"/>
  <text x="${labelWidth / 2}" y="${height / 2 + 4}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" fill="${color}" text-anchor="middle" opacity="0.85">${escapeXml(label)}</text>
  <text x="${labelWidth + valueWidth / 2}" y="${height / 2 + 4}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" font-weight="bold" fill="${color}" text-anchor="middle">${escapeXml(value)}</text>
</svg>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  const headers = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  };

  if (!key || !process.env.DATABASE_URL) {
    return new Response(renderBadge({ label: "CREDCHECK", value: "N/A", color: "#6b8577" }), {
      headers,
    });
  }

  try {
    const row = await prisma.scanCache.findUnique({ where: { normalizedKey: key } });
    const expired = !row || row.expiresAt.getTime() <= Date.now();

    if (!row || expired) {
      return new Response(
        renderBadge({ label: "CREDCHECK", value: "SCAN ME", color: "#6b8577" }),
        { headers },
      );
    }

    const result = row.resultJson as unknown as ScanResult;
    const band = result.score?.risk_band ?? "caution";
    const score = result.score?.trust_score ?? "?";

    return new Response(
      renderBadge({ label: "CREDCHECK", value: `${score}/100`, color: BAND_COLOR[band] ?? "#fbbf24" }),
      { headers },
    );
  } catch {
    return new Response(renderBadge({ label: "CREDCHECK", value: "ERROR", color: "#f87171" }), {
      headers,
    });
  }
}
