import { runSignal, type SignalResult } from "./types";

/**
 * Brand impersonation check — catches the single most common scam pattern:
 * a domain or handle dressed up to look like a brand it isn't.
 *
 * Three independent heuristics, all computed locally (no network, no API):
 *  1. Homoglyph substitution — "amaz0n.com", "n1ke.shop" normalize to a
 *     known brand name but aren't the brand's canonical domain.
 *  2. Typosquats — edit distance 1 (2 for long names) from a known brand,
 *     e.g. "amazonn.com", "paypa1.com" (after homoglyph folding).
 *  3. Brand-plus-bait compounds — the brand name glued to a lure word,
 *     e.g. "paypal-verify.net", "@nike_outlet_sale".
 *
 * A hit is a *signal*, not proof: resellers legitimately mention brands.
 * That nuance is stated in the notes so the synthesis step can weigh it.
 */

interface Brand {
  name: string;
  /** the brand's real registrable domain — exact match means "not an impostor" */
  canonical: string;
}

const BRANDS: Brand[] = [
  { name: "amazon", canonical: "amazon.com" },
  { name: "paypal", canonical: "paypal.com" },
  { name: "apple", canonical: "apple.com" },
  { name: "google", canonical: "google.com" },
  { name: "microsoft", canonical: "microsoft.com" },
  { name: "facebook", canonical: "facebook.com" },
  { name: "instagram", canonical: "instagram.com" },
  { name: "whatsapp", canonical: "whatsapp.com" },
  { name: "netflix", canonical: "netflix.com" },
  { name: "spotify", canonical: "spotify.com" },
  { name: "youtube", canonical: "youtube.com" },
  { name: "tiktok", canonical: "tiktok.com" },
  { name: "twitter", canonical: "twitter.com" },
  { name: "telegram", canonical: "telegram.org" },
  { name: "nike", canonical: "nike.com" },
  { name: "adidas", canonical: "adidas.com" },
  { name: "puma", canonical: "puma.com" },
  { name: "zara", canonical: "zara.com" },
  { name: "shein", canonical: "shein.com" },
  { name: "temu", canonical: "temu.com" },
  { name: "ebay", canonical: "ebay.com" },
  { name: "etsy", canonical: "etsy.com" },
  { name: "walmart", canonical: "walmart.com" },
  { name: "target", canonical: "target.com" },
  { name: "bestbuy", canonical: "bestbuy.com" },
  { name: "costco", canonical: "costco.com" },
  { name: "aliexpress", canonical: "aliexpress.com" },
  { name: "alibaba", canonical: "alibaba.com" },
  { name: "flipkart", canonical: "flipkart.com" },
  { name: "myntra", canonical: "myntra.com" },
  { name: "shopify", canonical: "shopify.com" },
  { name: "samsung", canonical: "samsung.com" },
  { name: "sony", canonical: "sony.com" },
  { name: "playstation", canonical: "playstation.com" },
  { name: "xbox", canonical: "xbox.com" },
  { name: "nintendo", canonical: "nintendo.com" },
  { name: "steam", canonical: "steampowered.com" },
  { name: "rolex", canonical: "rolex.com" },
  { name: "gucci", canonical: "gucci.com" },
  { name: "chanel", canonical: "chanel.com" },
  { name: "louisvuitton", canonical: "louisvuitton.com" },
  { name: "hermes", canonical: "hermes.com" },
  { name: "rayban", canonical: "ray-ban.com" },
  { name: "lego", canonical: "lego.com" },
  { name: "dyson", canonical: "dyson.com" },
  { name: "fedex", canonical: "fedex.com" },
  { name: "dhl", canonical: "dhl.com" },
  { name: "usps", canonical: "usps.com" },
  { name: "chase", canonical: "chase.com" },
  { name: "wellsfargo", canonical: "wellsfargo.com" },
  { name: "coinbase", canonical: "coinbase.com" },
  { name: "binance", canonical: "binance.com" },
  { name: "metamask", canonical: "metamask.io" },
  { name: "visa", canonical: "visa.com" },
  { name: "mastercard", canonical: "mastercard.com" },
];

/** Lure words scammers glue onto a brand name. */
const BAIT_WORDS = [
  "shop", "store", "outlet", "official", "support", "help", "verify",
  "verification", "secure", "security", "login", "signin", "account",
  "service", "customer", "care", "sale", "sales", "deals", "deal",
  "discount", "discounts", "offer", "offers", "giveaway", "promo",
  "gift", "gifts", "free", "online", "original", "genuine", "real",
  "clearance", "cheap", "wholesale", "factory", "warehouse", "refund",
  "billing", "payment", "update", "alert", "team", "usa", "uk", "india",
];

/** Free/near-free TLDs with well-documented abuse rates. A domain here isn't
 *  automatically a scam, but a *seller* on one is unusual enough to flag. */
const HIGH_RISK_TLDS = new Set(["tk", "ml", "ga", "cf", "gq"]);
/** Cheap TLDs heavily used in spam — worth a note, not a flag on their own. */
const WATCH_TLDS = new Set(["top", "icu", "buzz", "cam", "rest", "cyou", "monster", "quest", "click"]);
/** Generic TLDs where "exact brand name, wrong TLD" (amazon.shop) is a
 *  classic impostor pattern. Country TLDs are deliberately NOT here —
 *  amazon.co.uk-style country sites are usually the brand itself. */
const ABUSED_GENERIC_TLDS = new Set([
  "shop", "store", "online", "site", "website", "live", "xyz", "vip", "bond", "sbs", "cfd",
]);

/** Common visual substitutions, folded before comparison. Multi-char first.
 *  "1" plausibly imitates both "l" (paypa1) and "i" (n1ke), so folding
 *  returns every reading rather than betting on one. */
function foldVariants(s: string): string[] {
  const base = s
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
  const asL = base.replace(/1/g, "l");
  const asI = base.replace(/1/g, "i");
  return asL === asI ? [asL] : [asL, asI];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

export interface LookalikeData {
  target: string;
  matched_brand: string | null;
  match_kind: "homoglyph" | "typosquat" | "brand_plus_bait" | "exact_name" | null;
  /** the brand's real domain, when a brand matched */
  canonical_domain: string | null;
  risky_tld: string | null;
  brands_checked: number;
}

interface Verdict {
  brand: Brand;
  kind: NonNullable<LookalikeData["match_kind"]>;
  detail: string;
}

/** Strip separators so "pay-pal" / "pay.pal" / "pay_pal" compare as "paypal". */
function squash(s: string): string {
  return s.replace(/[-._]/g, "");
}

/** Smallest edit distance between any visual reading of `s` and the brand. */
function bestDistance(s: string, brandName: string): number {
  return Math.min(...foldVariants(s).map((v) => levenshtein(v, brandName)));
}

function readsAs(s: string, brandName: string): boolean {
  return foldVariants(s).includes(brandName);
}

/** Edit budget for a typosquat claim; 0 = don't claim (name too short —
 *  "vista" is one edit from "visa" but plainly isn't an imitation). */
function typoBudget(brandName: string): number {
  if (brandName.length >= 8) return 2;
  if (brandName.length >= 5) return 1;
  return 0;
}

function findImpersonation(name: string): Verdict | null {
  const rawSquashed = squash(name.toLowerCase());
  const tokens = name.toLowerCase().split(/[-._]/).filter(Boolean);

  for (const brand of BRANDS) {
    // 1) Same name once visual substitutions are folded, but not spelled right.
    if (readsAs(rawSquashed, brand.name) && rawSquashed !== brand.name) {
      return {
        brand,
        kind: "homoglyph",
        detail: `"${name}" reads as "${brand.name}" after character substitutions (e.g. 0→o, 1→i/l)`,
      };
    }

    // 2) Whole name one edit away from the brand (two for 8+ char names).
    const budget = typoBudget(brand.name);
    if (budget > 0) {
      const dist = bestDistance(rawSquashed, brand.name);
      if (
        dist > 0 &&
        dist <= budget &&
        Math.abs(rawSquashed.length - brand.name.length) <= budget
      ) {
        return {
          brand,
          kind: "typosquat",
          detail: `"${name}" is ${dist} edit${dist === 1 ? "" : "s"} away from "${brand.name}"`,
        };
      }
    }

    // 3) Brand + lure word. Requires either deliberate disguise ("n1ke-fanclub")
    //    or actual bait ("paypal-verify", "nikeoutlet", "adldas.store") —
    //    a mere mention like "nike-fan-blog" is NOT flagged, because many
    //    brands are also everyday words (target, apple, chase, visa).
    const hasBaitToken = tokens.some((t) => BAIT_WORDS.includes(t));
    const disguisedToken = tokens.find((t) => readsAs(t, brand.name) && t !== brand.name);
    const cleanTokenPlusBait = hasBaitToken && tokens.includes(brand.name);
    // A typo'd brand token counts only alongside bait: "adldas" + "store" is
    // an impersonation pattern; "chased" + "dreams" is just a word.
    const typoToken =
      hasBaitToken && budget > 0
        ? tokens.find(
            (t) =>
              !BAIT_WORDS.includes(t) &&
              bestDistance(t, brand.name) > 0 &&
              bestDistance(t, brand.name) <= budget &&
              Math.abs(t.length - brand.name.length) <= budget,
          )
        : undefined;
    const foldedWholes = foldVariants(rawSquashed);
    const rest =
      foldedWholes
        .map((w) => (w.includes(brand.name) ? w.replace(brand.name, "") : ""))
        .find((r) => r !== "") ?? "";
    const concatPlusBait = rest !== "" && BAIT_WORDS.some((w) => rest.includes(w));

    if (disguisedToken || cleanTokenPlusBait || typoToken || concatPlusBait) {
      const extra =
        tokens.filter((t) => !readsAs(t, brand.name) && t !== typoToken).join("-") ||
        rest.replace(/^[-._]+|[-._]+$/g, "");
      const detail = disguisedToken
        ? `"${name}" contains a disguised spelling of "${brand.name}"`
        : typoToken
          ? `"${name}" contains "${typoToken}" (near-miss of "${brand.name}") plus lure wording`
          : `"${name}" combines the brand "${brand.name}" with "${extra}"`;
      return { brand, kind: "brand_plus_bait", detail };
    }
  }
  return null;
}

/**
 * Check a website domain (e.g. "amaz0n-outlet.top") for brand impersonation
 * and risky-TLD patterns.
 */
export async function checkLookalikeDomain(domain: string): Promise<SignalResult<LookalikeData>> {
  return runSignal<LookalikeData>(
    { signal_name: "brand_lookalike", label: "Brand impersonation check" },
    async () => {
      // "amazon.co.uk" → name "amazon", tld "uk". Using the first label as
      // the name keeps multi-part country TLDs from polluting the comparison.
      const labels = domain.toLowerCase().split(".");
      const sld = labels[0] ?? domain;
      const tld = labels[labels.length - 1] ?? "";

      const data: LookalikeData = {
        target: domain,
        matched_brand: null,
        match_kind: null,
        canonical_domain: null,
        risky_tld: HIGH_RISK_TLDS.has(tld) || WATCH_TLDS.has(tld) ? tld : null,
        brands_checked: BRANDS.length,
      };

      // The brand's own canonical domain is by definition not an impostor.
      const canonical = BRANDS.find((b) => b.canonical === domain);
      if (canonical) {
        data.matched_brand = canonical.name;
        data.match_kind = "exact_name";
        data.canonical_domain = canonical.canonical;
        return {
          status: "ok",
          data,
          notes: `This is ${canonical.name}'s canonical domain — no impersonation pattern.`,
        };
      }

      // Exact brand name on a different TLD: "amazon.shop", "paypal.tk".
      // Flagged only on abused TLDs — "amazon.co.uk"-style country domains
      // are usually the brand itself, so those get a cautionary ok instead.
      const exactName = BRANDS.find((b) => squash(sld) === b.name);
      if (exactName) {
        data.matched_brand = exactName.name;
        data.match_kind = "exact_name";
        data.canonical_domain = exactName.canonical;
        const abusedTld =
          HIGH_RISK_TLDS.has(tld) || WATCH_TLDS.has(tld) || ABUSED_GENERIC_TLDS.has(tld);
        if (abusedTld) {
          return {
            status: "flag",
            data,
            notes: `Domain uses the exact name "${exactName.name}" on ".${tld}" — the real site is ${exactName.canonical}. Brand-name-on-a-cheap-TLD is a classic impostor pattern.`,
          };
        }
        return {
          status: "ok",
          data,
          notes: `Domain matches the brand name "${exactName.name}" but isn't its main domain (${exactName.canonical}). Often a legitimate country site — verify it's linked from the brand's real site.`,
        };
      }

      const hit = findImpersonation(sld);
      if (hit) {
        data.matched_brand = hit.brand.name;
        data.match_kind = hit.kind;
        data.canonical_domain = hit.brand.canonical;
        const kindLabel =
          hit.kind === "homoglyph"
            ? "uses lookalike characters to imitate"
            : hit.kind === "typosquat"
              ? "is one typo away from"
              : "piggybacks on the name of";
        return {
          status: "flag",
          data,
          notes: `Domain ${kindLabel} "${hit.brand.name}" (real site: ${hit.brand.canonical}) — ${hit.detail}. Resellers do exist, but impostor domains are a common scam pattern.`,
        };
      }

      if (HIGH_RISK_TLDS.has(tld)) {
        return {
          status: "flag",
          data,
          notes: `No brand-impersonation pattern, but ".${tld}" is a free TLD with a very high documented abuse rate — unusual for a legitimate seller.`,
        };
      }

      if (WATCH_TLDS.has(tld)) {
        return {
          status: "ok",
          data,
          notes: `No impersonation pattern against ${BRANDS.length} known brands. Note: ".${tld}" is a low-cost TLD often seen in spam — worth a second look, not a verdict.`,
        };
      }

      return {
        status: "ok",
        data,
        notes: `No typosquat, lookalike-character, or brand-bait pattern against ${BRANDS.length} well-known brands.`,
      };
    },
  );
}

/**
 * Check an Instagram handle (e.g. "n1ke_outlet") for the same impersonation
 * patterns. An exact brand-name handle is NOT flagged — we can't verify
 * account ownership, and the real brand usually owns its own name.
 */
export async function checkLookalikeHandle(handle: string): Promise<SignalResult<LookalikeData>> {
  return runSignal<LookalikeData>(
    { signal_name: "brand_lookalike", label: "Brand impersonation check" },
    async () => {
      const data: LookalikeData = {
        target: `@${handle}`,
        matched_brand: null,
        match_kind: null,
        canonical_domain: null,
        risky_tld: null,
        brands_checked: BRANDS.length,
      };

      const exact = BRANDS.find((b) => b.name === handle.toLowerCase());
      if (exact) {
        data.matched_brand = exact.name;
        data.match_kind = "exact_name";
        data.canonical_domain = exact.canonical;
        return {
          status: "ok",
          data,
          notes: `Handle matches the brand name "${exact.name}" exactly. We can't verify account ownership — check for the platform's verified badge.`,
        };
      }

      const hit = findImpersonation(handle);
      if (hit) {
        data.matched_brand = hit.brand.name;
        data.match_kind = hit.kind;
        data.canonical_domain = hit.brand.canonical;
        return {
          status: "flag",
          data,
          notes: `Handle imitates "${hit.brand.name}" — ${hit.detail}. Impostor handles with bait words (outlet/sale/giveaway) are a common Instagram scam pattern.`,
        };
      }

      return {
        status: "ok",
        data,
        notes: `No impersonation pattern against ${BRANDS.length} well-known brand names.`,
      };
    },
  );
}
