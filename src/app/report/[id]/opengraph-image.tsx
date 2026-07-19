import { ImageResponse } from "next/og";
import { loadReportRow } from "@/lib/reportLookup";
import type { ScanResult } from "@/lib/scan";
import type { RiskBand } from "@/lib/score/provisional";

/**
 * Social share card for /report/[id] — Next's opengraph-image file convention
 * wires this into og:image / twitter:image automatically, so a pasted report
 * link unfurls as a scannable verdict card instead of a bare URL. Rendered
 * with next/og (satori): flexbox-only layout, bundled default font.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CredCheck trust-scan verdict card";

const BAND_UI: Record<RiskBand, { label: string; color: string }> = {
  trusted: { label: "LIKELY LEGITIMATE", color: "#4ade80" },
  caution: { label: "CAUTION ADVISED", color: "#fbbf24" },
  high: { label: "HIGH RISK", color: "#f87171" },
};

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadReportRow(id).catch(() => null);
  const result = row ? (row.resultJson as unknown as ScanResult) : null;
  const band: RiskBand = result?.score?.risk_band ?? "caution";
  const ui = BAND_UI[band];
  const score = result?.score?.trust_score;
  const target = result?.input?.normalized ?? "unknown target";
  const signalsChecked = result?.signals?.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#05070a",
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: "#ef4444", opacity: 0.8 }} />
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: "#f59e0b", opacity: 0.8, marginLeft: 8 }} />
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, backgroundColor: "#4ade80", opacity: 0.8, marginLeft: 8 }} />
            <div style={{ display: "flex", fontSize: 30, color: "#4ade80", marginLeft: 20, fontWeight: 700 }}>
              credcheck://scan
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6b8577", letterSpacing: 4 }}>
            MULTI-SIGNAL TRUST SCANNER
          </div>
        </div>

        {/* Main panel */}
        <div
          style={{
            display: "flex",
            flex: 1,
            marginTop: 40,
            border: `3px solid ${ui.color}`,
            backgroundColor: "#0a0f0c",
            padding: 48,
            alignItems: "center",
          }}
        >
          {/* Score box */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 220,
              height: 220,
              border: `4px solid ${ui.color}`,
              backgroundColor: "#05070a",
            }}
          >
            <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: ui.color }}>
              {typeof score === "number" ? score : "?"}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#6b8577" }}>/ 100</div>
          </div>

          {/* Verdict + target */}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, flex: 1 }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: ui.color }}>
              {ui.label}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 34,
                color: "#d8f3e2",
                marginTop: 18,
                maxWidth: 640,
              }}
            >
              {target.length > 42 ? `${target.slice(0, 42)}…` : target}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#6b8577", marginTop: 18 }}>
              {signalsChecked > 0
                ? `${signalsChecked} independent signals · no single source decides`
                : "shared trust-scan report"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 32,
            fontSize: 22,
            color: "#6b8577",
          }}
        >
          <div style={{ display: "flex" }}>Informational only — not a verdict on any seller.</div>
          <div style={{ display: "flex", color: "#4ade80" }}>open the full report →</div>
        </div>
      </div>
    ),
    size,
  );
}
