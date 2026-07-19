import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLookalikeDomain, checkLookalikeHandle } from "../src/lib/signals/lookalike";

/** [input, expected status] — the false-positive rows are as load-bearing as
 *  the catches: common-word brands (visa/target/apple) must not misfire. */
const DOMAINS: Array<[string, "ok" | "flag"]> = [
  // impersonation patterns that must flag
  ["amaz0n.com", "flag"], // homoglyph
  ["amazonn.com", "flag"], // typosquat
  ["paypal-verify.net", "flag"], // brand + bait token
  ["nikeoutlet.shop", "flag"], // brand + bait, concatenated
  ["amazon.shop", "flag"], // exact name, abused TLD
  ["paypal.tk", "flag"], // exact name, free TLD
  ["randomstore.tk", "flag"], // free TLD alone
  ["n1ke-fanclub.com", "flag"], // disguised brand token
  ["walmartdiscounts.xyz", "flag"],
  // legitimate lookups that must NOT flag
  ["amazon.com", "ok"], // canonical domain
  ["amazon.co.uk", "ok"], // country variant
  ["nike.com", "ok"],
  ["vista.com", "ok"], // 1 edit from "visa" but not an imitation
  ["apple-orchard.com", "ok"], // brand word + non-bait word
  ["target-practice.org", "ok"],
  ["example.com", "ok"],
  ["streamdeals.com", "ok"], // "steam" is not a substring of "stream"
  ["ray-ban.com", "ok"], // canonical with hyphen
  ["myshopify.com", "ok"],
];

const HANDLES: Array<[string, "ok" | "flag"]> = [
  ["n1ke_official", "flag"],
  ["nike_outlet_sale", "flag"],
  ["adldas.store", "flag"], // typo'd brand token + bait
  ["nike", "ok"], // exact brand name: unverifiable, not flagged
  ["craftsbyjane", "ok"],
  ["applepiebaker", "ok"],
];

for (const [domain, want] of DOMAINS) {
  test(`domain ${domain} → ${want}`, async () => {
    const r = await checkLookalikeDomain(domain);
    assert.equal(r.status, want, r.notes);
  });
}

for (const [handle, want] of HANDLES) {
  test(`handle @${handle} → ${want}`, async () => {
    const r = await checkLookalikeHandle(handle);
    assert.equal(r.status, want, r.notes);
  });
}

test("flagged domains carry the matched brand + canonical domain in data", async () => {
  const r = await checkLookalikeDomain("amaz0n.com");
  assert.equal(r.data.matched_brand, "amazon");
  assert.equal(r.data.canonical_domain, "amazon.com");
  assert.equal(r.data.match_kind, "homoglyph");
});
