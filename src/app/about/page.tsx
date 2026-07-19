import Link from "next/link";
import type { Metadata } from "next";
import { Panel } from "@/components/Panel";

export const metadata: Metadata = {
  title: "How it works — CredCheck",
  description:
    "How CredCheck combines nine independent signals into one plain-English trust assessment — methodology, score bands, honest limitations, and the free API.",
};

/**
 * /about — the methodology page. Static content, server-rendered, no JS.
 * Two audiences: buyers who want to know why they should trust the score,
 * and developers who want the API. Honesty is the selling point — the
 * limitations section is as prominent as the capabilities.
 */

const SIGNALS: Array<{ name: string; how: string }> = [
  {
    name: "Domain age & WHOIS",
    how: "Registration date via WHOIS/RDAP. Most scam shops are weeks old; established businesses rarely are.",
  },
  {
    name: "SSL certificate",
    how: "A live TLS handshake plus the domain's certificate-transparency history (crt.sh).",
  },
  {
    name: "Email & DNS setup",
    how: "MX, SPF, DMARC and nameserver records. A storefront that can't receive email is a bad sign.",
  },
  {
    name: "Brand impersonation",
    how: "Typosquats (amazonn), lookalike characters (amaz0n, n1ke), brand-plus-bait names (paypal-verify), and brand names parked on high-abuse TLDs — checked locally against 55 well-known brands.",
  },
  {
    name: "Redirect & link-shortener check",
    how: "Follows the address's redirect chain (without executing the page) and flags URL shorteners, cross-domain hops, and unusually long chains.",
  },
  {
    name: "Site policies & contact info",
    how: "A headless browser loads the homepage and looks for a privacy policy, refund policy, physical address, phone and email — and captures a screenshot for the report.",
  },
  {
    name: "Contact consistency",
    how: "Does the site's contact email belong to the site's own domain, or to a throwaway inbox?",
  },
  {
    name: "Review sentiment",
    how: "AFINN sentiment over collected reviews plus uniform-rating detection (a wall of identical 5★ is its own red flag). Currently fed by a stub source, and labeled as such.",
  },
  {
    name: "Scam-report cross-check",
    how: "A curated blocklist plus community reports — which only count after a moderator approves them.",
  },
];

const ENDPOINTS: Array<{ method: string; path: string; what: string }> = [
  { method: "POST", path: "/api/scan", what: "Run a scan; JSON result. Body: {\"input\": \"…\", \"force\": false}" },
  { method: "POST", path: "/api/scan/stream", what: "Same scan, streamed as NDJSON progress events" },
  { method: "GET", path: "/api/report/{id}/json", what: "Raw ScanResult of a saved report" },
  { method: "GET", path: "/api/report/{id}/pdf", what: "Print-quality PDF of a saved report" },
  { method: "GET", path: "/api/badge?key={target}", what: "Live SVG trust badge for embedding" },
  { method: "GET", path: "/api/recent", what: "Latest scans, chip-sized" },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <header className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
          // methodology
        </p>
        <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_14px_rgba(74,222,128,0.4)]">
          HOW IT WORKS
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-emerald-100/50">
          CredCheck runs nine independent checks against a seller and asks a language model
          (or a deterministic fallback) to weigh them into one 0–100 score. No single
          source decides — that&apos;s the whole point.
        </p>
      </header>

      <div className="space-y-4">
        <Panel label="the signals" id="signals" className="scroll-mt-20 p-6">
          <ul className="space-y-3.5">
            {SIGNALS.map((s, i) => (
              <li key={s.name} className="flex gap-3 text-sm">
                <span className="shrink-0 font-bold tabular-nums text-emerald-400/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="font-semibold text-emerald-100">{s.name}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-emerald-100/50">
                    {s.how}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-emerald-400/10 pt-3 text-xs text-emerald-100/40">
            Every check degrades gracefully: a dead source reports itself as
            &quot;unavailable&quot; and lowers the score&apos;s <em>confidence</em> instead of
            crashing the scan.
          </p>
        </Panel>

        <Panel label="the score" className="p-6">
          <ul className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="w-16 shrink-0 font-bold text-emerald-400">70–100</span>
              <span className="text-emerald-100/70">
                Likely legitimate — the signals mostly agree this looks like a real seller.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-16 shrink-0 font-bold text-amber-400">40–69</span>
              <span className="text-emerald-100/70">
                Caution advised — mixed or thin evidence; verify independently before paying.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-16 shrink-0 font-bold text-red-400">0–39</span>
              <span className="text-emerald-100/70">
                High risk — multiple red flags, or a strong single one (like a blocklist hit).
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-emerald-100/50">
            Flags weigh more than missing positives, and the score always ships with a
            confidence percentage plus a &quot;what we couldn&apos;t check&quot; list — the gaps
            are part of the answer, not hidden.
          </p>
        </Panel>

        <Panel label="honest limitations" className="p-6">
          <ul className="space-y-2 text-sm text-emerald-100/60">
            <li>· A good score is <strong className="text-emerald-100/90">not a guarantee</strong> — new scams start with clean signals.</li>
            <li>· A bad score is <strong className="text-emerald-100/90">not a verdict</strong> — small legitimate sellers can look thin on paper.</li>
            <li>· Review data is currently a labeled stub, and the blocklist is small and curated.</li>
            <li>· Instagram checks are limited to what&apos;s publicly inferable without an API.</li>
          </ul>
          <p className="mt-4 text-xs text-emerald-100/40">
            Use the score the way you&apos;d use a friend&apos;s opinion: one more input to your
            own judgement.
          </p>
        </Panel>

        <Panel label="free api" className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-emerald-400/15 text-[10px] uppercase tracking-wider text-emerald-100/40">
                  <th className="py-1.5 pr-3">Method</th>
                  <th className="py-1.5 pr-3">Endpoint</th>
                  <th className="py-1.5">What it does</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.path} className="border-b border-emerald-400/5 last:border-0">
                    <td className="py-2 pr-3 font-bold text-emerald-400/80">{e.method}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-emerald-300/80">{e.path}</td>
                    <td className="py-2 text-emerald-100/60">{e.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="mt-3 overflow-x-auto border border-emerald-400/10 bg-black/60 p-3 text-[11px] leading-relaxed text-emerald-300/80">
{`curl -N -X POST http://localhost:3000/api/scan/stream \\
  -H "Content-Type: application/json" \\
  -d '{"input":"example.com"}'`}
          </pre>
          <p className="mt-2 text-[10px] text-emerald-100/40">
            Rate-limited per IP. No key, no signup — it&apos;s all free/open-source.
          </p>
        </Panel>
      </div>

      <footer className="mt-8 text-center">
        <Link
          href="/"
          className="inline-block border border-emerald-400/50 bg-emerald-400/10 px-5 py-2.5 text-sm text-emerald-300 transition hover:bg-emerald-400/20"
        >
          [ run a scan ]
        </Link>
      </footer>
    </main>
  );
}
