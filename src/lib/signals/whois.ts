import whoiser from "whoiser";
import { runSignal, type SignalResult } from "./types";

/**
 * Step 2 — Domain age + WHOIS lookup.
 *
 * Uses the `whoiser` package, which talks WHOIS/RDAP directly to registries.
 * No API key, no paid service. WHOIS field names vary wildly by TLD and
 * registrar, so we scan every returned server block for the fields we want
 * rather than assuming a fixed schema.
 */

export interface DomainAgeData {
  domain: string;
  creation_date: string | null;
  age_days: number | null;
  registrar: string | null;
  registrant_country: string | null;
  expiration_date: string | null;
}

/** A brand-new domain is one of the strongest low-cost scam signals. */
const NEW_DOMAIN_DAYS = 90;

type WhoisBlock = Record<string, unknown>;

function firstString(v: unknown): string | null {
  if (Array.isArray(v)) return firstString(v[0]);
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Find the first value whose key matches `re`, optionally excluding keys. */
function findField(blocks: WhoisBlock[], re: RegExp, exclude?: RegExp): string | null {
  for (const block of blocks) {
    for (const [key, value] of Object.entries(block)) {
      if (exclude && exclude.test(key)) continue;
      if (re.test(key)) {
        const s = firstString(value);
        if (s) return s;
      }
    }
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function checkDomainAge(domain: string): Promise<SignalResult<DomainAgeData>> {
  return runSignal<DomainAgeData>(
    { signal_name: "domain_age", label: "Domain age & WHOIS" },
    async () => {
      // `follow: 1` chases the registrar's WHOIS server for richer data.
      const result = (await whoiser(domain, { follow: 2, timeout: 8000 })) as Record<
        string,
        WhoisBlock
      >;

      // Flatten every server block, dropping ones that only carry an error.
      const blocks = Object.values(result).filter(
        (b) => b && typeof b === "object" && !("error" in b),
      );

      const creationRaw = findField(
        blocks,
        /(creat|registered on|registration (date|time)|created on)/i,
      );
      const registrar = findField(blocks, /^registrar$|sponsoring registrar/i, /url|whois|iana|abuse/i);
      const country = findField(blocks, /registrant country|^country$/i);
      const expiryRaw = findField(blocks, /(expir|registry expiry|paid-till)/i);

      const creationDate = parseDate(creationRaw);
      const ageDays = creationDate
        ? Math.floor((Date.now() - creationDate.getTime()) / 86_400_000)
        : null;

      const data: DomainAgeData = {
        domain,
        creation_date: creationDate ? creationDate.toISOString() : null,
        age_days: ageDays,
        registrar: registrar ?? null,
        registrant_country: country ?? null,
        expiration_date: parseDate(expiryRaw)?.toISOString() ?? null,
      };

      // No creation date at all → we genuinely couldn't assess age.
      if (ageDays === null) {
        return {
          status: "unavailable",
          data,
          notes:
            "WHOIS responded but didn't expose a registration date (some registries redact this). Age couldn't be assessed.",
        };
      }

      if (ageDays < NEW_DOMAIN_DAYS) {
        return {
          status: "flag",
          data,
          notes: `Domain is only ${ageDays} days old (registered ${data.creation_date?.slice(
            0,
            10,
          )}). Very new domains (< ${NEW_DOMAIN_DAYS} days) are a common scam signal.`,
        };
      }

      const years = (ageDays / 365).toFixed(1);
      return {
        status: "ok",
        data,
        notes: `Domain registered ${data.creation_date?.slice(0, 10)} — about ${years} years old${
          registrar ? `, via ${registrar.replace(/\.$/, "")}` : ""
        }.`,
      };
    },
  );
}
