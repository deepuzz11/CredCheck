import type { ScanResult } from "@/lib/scan";
import type { RiskBand } from "@/lib/score/provisional";

/**
 * A deliberately different medium from the on-screen scanner-console UI: a
 * clean, light, print-friendly document. A PDF meant as a paper trail for a
 * dispute/chargeback should read as a professional report, not a screenshot
 * of a terminal — so this intentionally doesn't reuse the app's dark theme.
 * Rendered at /report/[id]?print=1 and captured by the Playwright PDF route.
 */

const BAND_LABEL: Record<RiskBand, string> = {
  trusted: "Likely Legitimate",
  caution: "Caution Advised",
  high: "High Risk",
};

const BAND_COLOR: Record<RiskBand, string> = {
  trusted: "#0ca30c",
  caution: "#b45309",
  high: "#b91c1c",
};

const STATUS_COLOR: Record<string, string> = {
  ok: "#0ca30c",
  flag: "#b45309",
  unavailable: "#999999",
};

export function PrintableReport({ result }: { result: ScanResult }) {
  const { input, score, signals, scanned_at } = result;
  const bandColor = BAND_COLOR[score.risk_band];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#111111",
        fontFamily: "Helvetica, Arial, sans-serif",
        padding: "48px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "2px solid #111",
            paddingBottom: 16,
            marginBottom: 32,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>CredCheck</div>
            <div style={{ fontSize: 11, color: "#666" }}>Trust scan report — informational only</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#666" }}>
            Generated {new Date().toLocaleString()}
            <br />
            Scanned {new Date(scanned_at).toLocaleString()}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", width: 116 }}>
                <div
                  style={{
                    border: `3px solid ${bandColor}`,
                    width: 100,
                    height: 100,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 700, color: bandColor }}>
                    {score.trust_score}
                  </div>
                  <div style={{ fontSize: 10, color: "#666" }}>/ 100</div>
                </div>
              </td>
              <td style={{ verticalAlign: "top", paddingLeft: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: bandColor }}>
                  {BAND_LABEL[score.risk_band]}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
                  {input.type} · {input.normalized}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  Confidence: {Math.round(score.confidence * 100)}%
                </div>
                {score.provisional && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>
                    Scored with rule-based logic (no LLM synthesis available for this scan).
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            What we found
          </h2>
          <ul style={{ fontSize: 12, lineHeight: 1.7, marginTop: 8, paddingLeft: 16 }}>
            {score.explanation_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Signals checked
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px 4px 0" }}>
                  Signal
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                  Status
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 0" }}>
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.signal_name}>
                  <td style={{ padding: "6px 8px 6px 0", borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                    {s.label}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid #eee",
                      verticalAlign: "top",
                      fontWeight: 700,
                      color: STATUS_COLOR[s.status] ?? "#666",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.status.toUpperCase()}
                  </td>
                  <td style={{ padding: "6px 0", borderBottom: "1px solid #eee", verticalAlign: "top", color: "#444" }}>
                    {s.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {score.data_gaps.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              What we couldn&apos;t check
            </h2>
            <ul style={{ fontSize: 12, lineHeight: 1.7, marginTop: 8, paddingLeft: 16, color: "#555" }}>
              {score.data_gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 40, borderTop: "1px solid #ccc", paddingTop: 16, fontSize: 10, color: "#888" }}>
          Informational only. CredCheck combines public signals to help you make your own
          judgement. It is not a guarantee of safety or a verdict on any seller.
          {result.id && <> Report ID: {result.id}</>}
        </div>
      </div>
    </div>
  );
}
