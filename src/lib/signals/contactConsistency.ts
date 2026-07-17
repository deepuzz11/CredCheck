import { runSignal, type SignalResult } from "./types";
import type { FingerprintData } from "./fingerprint";

/**
 * Step 5 — Contact consistency checker.
 *
 * Pure logic: compares the domain of the contact email found during site
 * fingerprinting (step 4) against the site's own domain. A seller using a
 * free webmail address (gmail/outlook/etc.) instead of an address on their
 * own domain — or an email on a completely unrelated domain — is a common
 * low-effort-storefront signal.
 *
 * This depends on fingerprint output, so it runs after that module rather
 * than in the initial parallel batch.
 */

export interface ContactConsistencyData {
  site_domain: string;
  contact_email: string | null;
  email_domain: string | null;
  matches_site_domain: boolean | null;
  is_free_webmail: boolean;
}

const FREE_WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "zoho.com",
]);

function baseDomain(host: string): string {
  const parts = host.toLowerCase().split(".");
  return parts.length <= 2 ? host.toLowerCase() : parts.slice(-2).join(".");
}

export async function checkContactConsistency(
  siteDomain: string,
  fingerprint: FingerprintData | null,
): Promise<SignalResult<ContactConsistencyData>> {
  return runSignal<ContactConsistencyData>(
    { signal_name: "contact_consistency", label: "Contact consistency" },
    async () => {
      const contactEmail = fingerprint?.contact_email ?? null;

      if (!contactEmail) {
        return {
          status: "unavailable",
          data: {
            site_domain: siteDomain,
            contact_email: null,
            email_domain: null,
            matches_site_domain: null,
            is_free_webmail: false,
          },
          notes: "No contact email was found on the site to compare against its domain.",
        };
      }

      const emailDomain = contactEmail.split("@")[1]?.toLowerCase() ?? null;
      if (!emailDomain) {
        return {
          status: "unavailable",
          data: {
            site_domain: siteDomain,
            contact_email: contactEmail,
            email_domain: null,
            matches_site_domain: null,
            is_free_webmail: false,
          },
          notes: "Found a contact email but couldn't parse its domain.",
        };
      }

      const siteBase = baseDomain(siteDomain);
      const emailBase = baseDomain(emailDomain);
      const matches = siteBase === emailBase;
      const isFreeWebmail = FREE_WEBMAIL_DOMAINS.has(emailBase);

      const data: ContactConsistencyData = {
        site_domain: siteDomain,
        contact_email: contactEmail,
        email_domain: emailDomain,
        matches_site_domain: matches,
        is_free_webmail: isFreeWebmail,
      };

      if (matches) {
        return {
          status: "ok",
          data,
          notes: `Contact email (${contactEmail}) is on the site's own domain.`,
        };
      }

      if (isFreeWebmail) {
        return {
          status: "flag",
          data,
          notes: `Contact email (${contactEmail}) is a free webmail address rather than one on ${siteDomain}. Common among low-effort or short-lived storefronts.`,
        };
      }

      return {
        status: "flag",
        data,
        notes: `Contact email (${contactEmail}) is on a completely different domain than the site itself (${siteDomain}).`,
      };
    },
  );
}
