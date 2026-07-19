import { parse } from "tldts";
import { runSignal, type SignalResult } from "./types";

/**
 * Redirect-chain analysis — where does this link *actually* go?
 *
 * Scam listings routinely hide their real destination behind link shorteners
 * or multi-hop redirects. This module follows the chain manually (up to
 * MAX_HOPS, never executing the page) and reports:
 *   - the full hop chain,
 *   - whether the entry domain is a known URL shortener,
 *   - whether the chain silently lands on a different registrable domain.
 *
 * All plain HTTP — no browser, no API, no key.
 */

export interface RedirectData {
  chain: Array<{ url: string; status: number }>;
  final_url: string | null;
  final_domain: string | null;
  hops: number;
  entry_is_shortener: boolean;
  crosses_domains: boolean;
}

const MAX_HOPS = 5;
const TOTAL_TIMEOUT_MS = 8000;

/** Well-known link shorteners / click-tracking hosts. A seller identity
 *  hidden behind one is worth a flag on its own. */
const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "buff.ly",
  "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc", "rebrand.ly", "bl.ink",
  "lnkd.in", "s.id", "v.gd", "ow.ly", "t.ly", "shorte.st", "adf.ly",
  "linktr.ee", "smarturl.it",
]);

function registrable(url: string): string | null {
  try {
    return parse(new URL(url).hostname).domain;
  } catch {
    return null;
  }
}

export async function checkRedirectChain(startUrl: string): Promise<SignalResult<RedirectData>> {
  return runSignal<RedirectData>(
    { signal_name: "redirect_chain", label: "Redirect & link-shortener check" },
    async () => {
      const entryDomain = registrable(startUrl);
      const entryIsShortener = entryDomain !== null && SHORTENERS.has(entryDomain);

      const chain: RedirectData["chain"] = [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

      let current = startUrl;
      let finalUrl: string | null = null;
      try {
        for (let hop = 0; hop <= MAX_HOPS; hop++) {
          const res = await fetch(current, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "user-agent":
                "Mozilla/5.0 (compatible; CredCheckBot/0.1; +https://github.com/) trust-scoring research tool",
            },
          });
          chain.push({ url: current, status: res.status });
          // Drain nothing — we only care about headers.
          res.body?.cancel().catch(() => {});

          const location = res.headers.get("location");
          if (res.status >= 300 && res.status < 400 && location) {
            const next = new URL(location, current).href;
            if (hop === MAX_HOPS) break; // chain longer than we'll follow
            current = next;
            continue;
          }
          finalUrl = current;
          break;
        }
      } finally {
        clearTimeout(timer);
      }

      const finalDomain = finalUrl ? registrable(finalUrl) : registrable(current);
      const hops = chain.length - 1;
      const crossesDomains =
        entryDomain !== null && finalDomain !== null && entryDomain !== finalDomain;

      const data: RedirectData = {
        chain,
        final_url: finalUrl ?? current,
        final_domain: finalDomain,
        hops: Math.max(0, hops),
        entry_is_shortener: entryIsShortener,
        crosses_domains: crossesDomains,
      };

      if (entryIsShortener) {
        const destination =
          finalDomain && finalDomain !== entryDomain
            ? ` — the real destination is ${finalDomain}; scan that domain directly`
            : "";
        return {
          status: "flag",
          data,
          notes: `The link goes through ${entryDomain}, a URL shortener${destination}. Legitimate sellers rarely hide their storefront behind a shortener.`,
        };
      }

      if (crossesDomains) {
        return {
          status: "flag",
          data,
          notes: `The address silently redirects to a different site: ${entryDomain} → ${finalDomain} (${hops} hop${hops === 1 ? "" : "s"}). The score should reflect ${finalDomain}, not the address you pasted.`,
        };
      }

      if (hops >= 3) {
        return {
          status: "flag",
          data,
          notes: `Unusually long redirect chain (${hops} hops) before the page loads — common in cloaked or affiliate-hijacked links.`,
        };
      }

      if (finalUrl === null) {
        return {
          status: "unavailable",
          data,
          notes: `Redirect chain didn't settle within ${MAX_HOPS} hops — couldn't determine the final destination.`,
        };
      }

      return {
        status: "ok",
        data,
        notes:
          hops === 0
            ? "The address serves its page directly — no redirects, no shorteners."
            : `Resolves normally on the same site after ${hops} redirect${hops === 1 ? "" : "s"} (e.g. http→https or www).`,
      };
    },
  );
}
