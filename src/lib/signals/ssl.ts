import tls from "node:tls";
import { runSignal, type SignalResult } from "./types";

/**
 * Step 3 — SSL certificate check.
 *
 * Two free, keyless sources:
 *  1. A direct TLS handshake (Node's built-in `tls` module) to read the live
 *     certificate's validity window and issuer.
 *  2. crt.sh's public Certificate Transparency search (JSON output) for a
 *     history of certs issued for the domain. crt.sh can be slow/flaky, so
 *     it's treated as a bonus enrichment — its failure never fails the module,
 *     only the direct handshake can.
 */

export interface SslCertData {
  domain: string;
  has_valid_cert: boolean;
  issuer: string | null;
  subject: string | null;
  valid_from: string | null;
  valid_to: string | null;
  days_until_expiry: number | null;
  cert_age_days: number | null;
  /** distinct issuing CAs seen in crt.sh history; null if crt.sh was unreachable */
  ct_log_issuer_count: number | null;
  ct_log_cert_count: number | null;
}

const HANDSHAKE_TIMEOUT_MS = 8000;
const CRTSH_TIMEOUT_MS = 8000;

function getPeerCert(domain: string): Promise<tls.PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain, // SNI
        timeout: HANDSHAKE_TIMEOUT_MS,
        rejectUnauthorized: false, // we want to inspect the cert even if the chain is bad
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error("Server presented no certificate."));
        } else {
          resolve(cert);
        }
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS handshake timed out."));
    });
    socket.on("error", (err) => reject(err));
  });
}

interface CrtShEntry {
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
}

async function getCrtShHistory(
  domain: string,
): Promise<{ issuerCount: number; certCount: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRTSH_TIMEOUT_MS);
    const res = await fetch(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    // crt.sh sometimes returns concatenated JSON objects instead of a single
    // valid array; fall back to a permissive line-ish parse if needed.
    const text = await res.text();
    let entries: CrtShEntry[];
    try {
      entries = JSON.parse(text);
    } catch {
      entries = JSON.parse(`[${text.trim().replace(/}\s*{/g, "},{")}]`);
    }
    if (!Array.isArray(entries)) return null;

    const issuers = new Set(entries.map((e) => e.issuer_name).filter(Boolean));
    return { issuerCount: issuers.size, certCount: entries.length };
  } catch {
    return null;
  }
}

export async function checkSslCertificate(domain: string): Promise<SignalResult<SslCertData>> {
  return runSignal<SslCertData>(
    { signal_name: "ssl_cert", label: "SSL certificate" },
    async () => {
      const [certResult, ctHistory] = await Promise.allSettled([
        getPeerCert(domain),
        getCrtShHistory(domain),
      ]);

      const ct = ctHistory.status === "fulfilled" ? ctHistory.value : null;

      if (certResult.status === "rejected") {
        return {
          status: "flag",
          data: {
            domain,
            has_valid_cert: false,
            issuer: null,
            subject: null,
            valid_from: null,
            valid_to: null,
            days_until_expiry: null,
            cert_age_days: null,
            ct_log_issuer_count: ct?.issuerCount ?? null,
            ct_log_cert_count: ct?.certCount ?? null,
          },
          notes: `Couldn't establish a valid HTTPS connection (${certResult.reason instanceof Error ? certResult.reason.message : "unknown error"}). Sites without working SSL are a strong risk signal.`,
        };
      }

      const cert = certResult.value;
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const now = Date.now();
      const daysUntilExpiry = validTo
        ? Math.floor((validTo.getTime() - now) / 86_400_000)
        : null;
      const certAgeDays = validFrom
        ? Math.floor((now - validFrom.getTime()) / 86_400_000)
        : null;

      const asString = (v: string | string[] | undefined): string | null =>
        Array.isArray(v) ? v[0] ?? null : v ?? null;

      const data: SslCertData = {
        domain,
        has_valid_cert: true,
        issuer: asString(cert.issuer?.O) ?? asString(cert.issuer?.CN),
        subject: asString(cert.subject?.CN),
        valid_from: validFrom?.toISOString() ?? null,
        valid_to: validTo?.toISOString() ?? null,
        days_until_expiry: daysUntilExpiry,
        cert_age_days: certAgeDays,
        ct_log_issuer_count: ct?.issuerCount ?? null,
        ct_log_cert_count: ct?.certCount ?? null,
      };

      if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
        return {
          status: "flag",
          data,
          notes: `SSL certificate expired ${Math.abs(daysUntilExpiry)} days ago (issued by ${data.issuer ?? "unknown issuer"}).`,
        };
      }

      if (daysUntilExpiry !== null && daysUntilExpiry < 14) {
        return {
          status: "flag",
          data,
          notes: `SSL certificate expires in ${daysUntilExpiry} days — unusually close to expiry, worth a second look.`,
        };
      }

      return {
        status: "ok",
        data,
        notes: `Valid SSL certificate from ${data.issuer ?? "an unknown issuer"}${
          daysUntilExpiry !== null ? `, expires in ${daysUntilExpiry} days` : ""
        }${ct ? `. Certificate Transparency logs show ${ct.certCount} cert(s) from ${ct.issuerCount} issuer(s) over time` : ""}.`,
      };
    },
  );
}
