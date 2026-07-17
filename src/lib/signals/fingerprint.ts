import { chromium } from "playwright";
import { runSignal, type SignalResult } from "./types";

/**
 * Step 4 — Site fingerprinting.
 *
 * Loads the seller's homepage with a headless browser and looks for the
 * trust-relevant markers a legitimate storefront usually has: a privacy
 * policy, a refund/returns policy, a physical address, a phone number, and a
 * contact email. All detection here is heuristic (regex/text-based) — it's a
 * signal, not a certainty, and is reported as such.
 */

export interface FingerprintData {
  url: string;
  has_privacy_policy: boolean;
  has_refund_policy: boolean;
  has_physical_address: boolean;
  has_phone_number: boolean;
  contact_email: string | null;
  page_title: string | null;
}

const NAV_TIMEOUT_MS = 15000;

const PRIVACY_RE = /privacy\s*(policy|notice)/i;
const REFUND_RE = /(refund|return)s?\s*(policy|&\s*exchange|and\s*exchange)?|exchange\s*policy/i;
// Loose heuristic: a street number followed by a word and a common street suffix.
const ADDRESS_RE =
  /\d{1,5}\s+[A-Za-z0-9.\s]{2,40}\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|suite|ste\.?|way|court|ct\.?)\b/i;
// Loose international phone pattern — 7+ digits allowing separators.
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export async function fingerprintSite(url: string): Promise<SignalResult<FingerprintData>> {
  return runSignal<FingerprintData>(
    { signal_name: "site_fingerprint", label: "Site policies & contact info" },
    async () => {
      const browser = await chromium.launch({ args: ["--no-sandbox"] });
      try {
        const page = await browser.newPage({
          userAgent:
            "Mozilla/5.0 (compatible; CredCheckBot/0.1; +https://github.com/) trust-scoring research tool",
        });
        page.setDefaultTimeout(NAV_TIMEOUT_MS);

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

        const title = await page.title().catch(() => null);
        const bodyText = await page.innerText("body").catch(() => "");

        const links = await page
          .$$eval("a", (as) =>
            as.map((a) => ({
              href: a.getAttribute("href") ?? "",
              text: (a.textContent ?? "").trim(),
            })),
          )
          .catch(() => [] as { href: string; text: string }[]);

        const hasPrivacy = links.some(
          (l) => PRIVACY_RE.test(l.text) || PRIVACY_RE.test(l.href),
        );
        const hasRefund = links.some(
          (l) => REFUND_RE.test(l.text) || REFUND_RE.test(l.href),
        );

        const mailtoLink = links.find((l) => l.href.startsWith("mailto:"));
        const mailtoEmail = mailtoLink
          ? mailtoLink.href.replace(/^mailto:/i, "").split("?")[0].trim()
          : null;
        const bodyEmailMatch = bodyText.match(EMAIL_RE);
        const contactEmail = mailtoEmail || bodyEmailMatch?.[0] || null;

        const hasAddress = ADDRESS_RE.test(bodyText);
        const hasPhone = PHONE_RE.test(bodyText);

        const data: FingerprintData = {
          url,
          has_privacy_policy: hasPrivacy,
          has_refund_policy: hasRefund,
          has_physical_address: hasAddress,
          has_phone_number: hasPhone,
          contact_email: contactEmail,
          page_title: title,
        };

        const missing: string[] = [];
        if (!hasPrivacy) missing.push("privacy policy");
        if (!hasRefund) missing.push("refund/return policy");
        if (!hasAddress) missing.push("physical address");
        if (!hasPhone) missing.push("phone number");
        if (!contactEmail) missing.push("contact email");

        if (missing.length >= 3) {
          return {
            status: "flag",
            data,
            notes: `Homepage is missing several trust markers: ${missing.join(", ")}. Legitimate storefronts usually surface these.`,
          };
        }

        if (missing.length > 0) {
          return {
            status: "ok",
            data,
            notes: `Found most expected trust markers on the homepage; missing: ${missing.join(", ")}.`,
          };
        }

        return {
          status: "ok",
          data,
          notes: "Homepage has a privacy policy, refund policy, physical address, phone number, and a contact email.",
        };
      } finally {
        await browser.close();
      }
    },
  );
}
