import { resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import { runSignal, type SignalResult } from "./types";

/**
 * DNS & email-infrastructure check.
 *
 * A real store almost always has working email DNS: MX records so
 * orders@their-domain can receive mail, and usually an SPF record so their
 * outgoing mail doesn't land in spam. Throwaway storefronts frequently have
 * neither — the domain exists only to serve the checkout page. DMARC is
 * recorded as a bonus maturity indicator but its absence is never flagged
 * (plenty of small legitimate shops don't publish one).
 *
 * All lookups go through Node's own resolver — free, no API key.
 */

export interface DnsHealthData {
  domain: string;
  nameservers: string[];
  mx_hosts: string[];
  has_spf: boolean;
  has_dmarc: boolean;
  dmarc_policy: string | null;
}

/** A missing record (ENODATA/ENOTFOUND) is a finding, not a failure. */
async function lookupOrEmpty<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export async function checkDnsHealth(domain: string): Promise<SignalResult<DnsHealthData>> {
  return runSignal<DnsHealthData>(
    { signal_name: "dns_health", label: "Email & DNS setup" },
    async () => {
      const [ns, mx, txt, dmarcTxt] = await Promise.all([
        lookupOrEmpty(() => resolveNs(domain)),
        lookupOrEmpty(() => resolveMx(domain)),
        lookupOrEmpty(() => resolveTxt(domain)),
        lookupOrEmpty(() => resolveTxt(`_dmarc.${domain}`)),
      ]);

      const txtRecords = txt.map((chunks) => chunks.join(""));
      const dmarcRecords = dmarcTxt.map((chunks) => chunks.join(""));

      const hasSpf = txtRecords.some((r) => r.toLowerCase().startsWith("v=spf1"));
      const dmarcRecord = dmarcRecords.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
      const dmarcPolicy = dmarcRecord?.match(/\bp=([a-z]+)/i)?.[1]?.toLowerCase() ?? null;

      const data: DnsHealthData = {
        domain,
        nameservers: ns.map((n) => n.toLowerCase()),
        mx_hosts: mx
          .sort((a, b) => a.priority - b.priority)
          .map((m) => m.exchange.toLowerCase()),
        has_spf: hasSpf,
        has_dmarc: Boolean(dmarcRecord),
        dmarc_policy: dmarcPolicy,
      };

      // Every lookup came back empty — the resolver itself is likely the
      // problem (or the domain doesn't resolve at all, which WHOIS/SSL will
      // already be reporting). Don't flag on no evidence.
      if (ns.length === 0 && mx.length === 0 && txtRecords.length === 0 && !dmarcRecord) {
        return {
          status: "unavailable",
          data,
          notes: "DNS lookups returned no records for this domain — couldn't assess its email setup.",
        };
      }

      if (mx.length === 0 && !hasSpf) {
        return {
          status: "flag",
          data,
          notes: `${domain} has no email DNS at all (no MX records, no SPF) — the domain can't receive email, which is unusual for a real store.`,
        };
      }

      const extras = [
        hasSpf ? "SPF" : null,
        dmarcRecord ? `DMARC (p=${dmarcPolicy ?? "none"})` : null,
      ].filter(Boolean);

      if (mx.length === 0) {
        return {
          status: "ok",
          data,
          notes: `${domain} publishes ${extras.join(" and ")} but has no MX records — mail sent to this domain won't be delivered.`,
        };
      }

      return {
        status: "ok",
        data,
        notes:
          `${domain} has working email DNS: ${mx.length} MX record${mx.length === 1 ? "" : "s"}` +
          (extras.length ? ` with ${extras.join(" and ")}` : " (no SPF/DMARC published)") +
          ".",
      };
    },
  );
}
