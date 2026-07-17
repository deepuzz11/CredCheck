import { parse } from "tldts";

/**
 * Step 1 — Input handler.
 *
 * Detects whether pasted input is a website URL, an Instagram handle, or a
 * marketplace listing URL, and normalizes it into a canonical form we can use
 * as a cache key and feed to the signal modules.
 */

export type InputType = "website" | "instagram" | "marketplace";

export interface NormalizedInput {
  type: InputType;
  /** exactly what the user pasted (trimmed) */
  raw: string;
  /** canonical key used for caching + display, e.g. "example.com" or "instagram:@nike" */
  normalized: string;
  /** registrable domain when we have one (website + marketplace) */
  domain?: string;
  /** full normalized URL when the input was a URL */
  url?: string;
  /** instagram handle without the leading @ */
  handle?: string;
  /** which marketplace, when detected */
  marketplace?: string;
}

/** Hostnames we treat as marketplaces rather than a seller's own website. */
const MARKETPLACES: Record<string, string> = {
  "amazon.com": "Amazon",
  "amazon.in": "Amazon",
  "amazon.co.uk": "Amazon",
  "ebay.com": "eBay",
  "ebay.co.uk": "eBay",
  "etsy.com": "Etsy",
  "aliexpress.com": "AliExpress",
  "flipkart.com": "Flipkart",
  "walmart.com": "Walmart",
  "mercari.com": "Mercari",
  "poshmark.com": "Poshmark",
  "depop.com": "Depop",
  "facebook.com": "Facebook Marketplace",
};

/** Instagram handles: 1–30 chars, letters/digits/period/underscore. */
const IG_HANDLE = /^[a-zA-Z0-9._]{1,30}$/;

export class InputDetectionError extends Error {}

export function detectAndNormalize(rawInput: string): NormalizedInput {
  const raw = rawInput.trim();
  if (!raw) throw new InputDetectionError("Please enter a URL or Instagram handle.");

  // 1) Explicit Instagram handle: "@nike"
  if (raw.startsWith("@")) {
    const handle = raw.slice(1).toLowerCase();
    if (!IG_HANDLE.test(handle)) {
      throw new InputDetectionError("That doesn't look like a valid Instagram handle.");
    }
    return {
      type: "instagram",
      raw,
      normalized: `instagram:@${handle}`,
      handle,
      url: `https://www.instagram.com/${handle}`,
    };
  }

  // 2) Anything that looks like a URL / hostname → parse it.
  const looksLikeUrl = /\./.test(raw) || /^https?:\/\//i.test(raw);
  if (looksLikeUrl) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let u: URL;
    try {
      u = new URL(withScheme);
    } catch {
      throw new InputDetectionError("That doesn't look like a valid URL.");
    }

    const host = u.hostname.toLowerCase();
    const parsed = parse(host);
    const registrable = parsed.domain; // e.g. "example.co.uk", null for things like localhost
    if (!registrable) {
      throw new InputDetectionError("Couldn't work out the domain from that input.");
    }

    // Instagram profile URL → treat as an Instagram handle.
    if (registrable === "instagram.com") {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg && IG_HANDLE.test(seg)) {
        const handle = seg.toLowerCase();
        return {
          type: "instagram",
          raw,
          normalized: `instagram:@${handle}`,
          handle,
          url: `https://www.instagram.com/${handle}`,
        };
      }
    }

    // Known marketplace host → marketplace listing.
    const marketplace = MARKETPLACES[registrable];
    if (marketplace) {
      return {
        type: "marketplace",
        raw,
        // full URL is the identity of a listing, so cache on the whole thing
        normalized: `marketplace:${u.href}`,
        domain: registrable,
        url: u.href,
        marketplace,
      };
    }

    // Otherwise: a seller's own website. Cache on the registrable domain.
    return {
      type: "website",
      raw,
      normalized: registrable,
      domain: registrable,
      url: `${u.protocol}//${host}${u.pathname === "/" ? "" : u.pathname}`,
    };
  }

  // 3) A bare token with no dot and no @: assume an Instagram handle
  //    (common when users paste just "nikestore").
  if (IG_HANDLE.test(raw)) {
    const handle = raw.toLowerCase();
    return {
      type: "instagram",
      raw,
      normalized: `instagram:@${handle}`,
      handle,
      url: `https://www.instagram.com/${handle}`,
    };
  }

  throw new InputDetectionError(
    "Couldn't tell if that's a website, Instagram handle, or marketplace link.",
  );
}
