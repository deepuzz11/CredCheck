# CredCheck — Can I Trust This Seller?

A multi-signal trust-scoring tool for online sellers (websites, Instagram
handles, marketplace listings). Paste a target and get a 0–100 trust score with
a plain-English explanation built from **several independent signals** — no
single source decides the score.

> **Informational only.** Not a guarantee of safety or a verdict on any seller.

## Status — MVP complete, plus extras

- [x] 1. Input handler — detects & normalizes website / Instagram / marketplace input
- [x] 2. Domain age + WHOIS — registration date, registrar, age, expiry
- [x] 3. SSL certificate check — live TLS handshake + crt.sh Certificate Transparency history
- [x] 4. Site fingerprinting (Playwright) — privacy/refund policy, address, phone, contact email
- [x] 5. Contact consistency — compares extracted email domain to site domain
- [x] 6. Review sentiment — AFINN sentiment + uniform-rating detection (mock/stubbed source)
- [x] 7. Scam-report cross-check — curated blocklist **+ moderated user reports**
- [x] 8. LLM synthesis — provider-agnostic (Ollama free/local by default, optional Anthropic, rule-based fallback)
- [x] 9. `/api/scan` — 48h Postgres cache + in-memory rate limiting
- [x] 10. Full results UI — scanner-console design, score breakdown chart, per-signal detail
- [x] Shareable permalinks — `/report/[id]`
- [x] Scan history — `/history`
- [x] Side-by-side comparison — `/compare`
- [x] Embeddable trust badge — `/api/badge` (dynamic SVG)
- [x] PDF export — a print-friendly report, one click from any permalink
- [x] "Report a scam" — crowd-sourced, **moderated before it affects scoring** — `/admin`
- [x] Email & DNS setup signal — MX / SPF / DMARC / nameservers via Node's resolver
- [x] Force rescan — `force: true` on `/api/scan` bypasses the 48h cache; "[ rescan fresh ]" button on any cached result
- [x] Raw JSON export — `/api/report/[id]/json`, next to the PDF download
- [x] History search & verdict filter — `/history?q=…&band=…` (works without JS)

Every module degrades gracefully: if a data source fails or is unreachable,
the scan still completes with a lower-confidence score instead of crashing.
See [Signal contract](#signal-contract) below.

## Setup

```bash
npm install                      # also runs `prisma generate` (postinstall)
npx playwright install chromium  # needed for fingerprinting + PDF export
npm run dev                      # http://localhost:3000
```

**Nothing above requires an API key.** Every feature works with zero env vars:
no cache (every scan runs fresh; history/permalinks/badges/compare-persistence/
reporting/admin are all disabled) and AI synthesis falls back to the
deterministic rule-based scorer. Optional enhancements:

```bash
# Enable 48h result caching + history/permalinks/badges/scam reporting
# (recommended — a full scan takes several seconds):
cp .env.example .env.local
npm run db:up        # starts Postgres via docker-compose
npm run db:migrate   # creates the ScanCache + ScamReport tables

# Enable the /admin moderation queue:
#   in .env.local: ADMIN_PASSWORD=<pick something>

# Enable local free LLM synthesis instead of the rule-based fallback:
#   1. install Ollama: https://ollama.com
#   2. ollama pull llama3.1 && ollama serve
#   3. in .env.local: LLM_PROVIDER=ollama
```

Optional paid path: set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in
`.env.local` to use the Anthropic API instead. Off by default.

If Playwright's sandboxed browser launch fails in your environment (common in
containers/CI), the fingerprinting and PDF-export modules already launch with
`--no-sandbox` — see `src/lib/signals/fingerprint.ts` and
`src/app/api/report/[id]/pdf/route.ts`.

**Note on `next build` + `next dev` together:** they share the `.next` build
cache — running a production build while the dev server is running will corrupt
its compiled chunks. Stop the dev server before building; `rm -rf .next` fixes
it if you hit `Cannot find module './NNN.js'`.

## Everything here is free / open source by default

| Concern              | Tool                              | Cost               |
| --------------------- | ---------------------------------- | ------------------ |
| Framework             | Next.js (App Router) + Tailwind    | free/OSS           |
| WHOIS / domain age    | `whoiser` (direct WHOIS/RDAP)      | free, no key       |
| SSL cert              | Node `tls` + crt.sh CT log search  | free, no key       |
| Email/DNS setup       | Node `dns` (MX/SPF/DMARC/NS)       | free, no key       |
| Site fingerprinting   | Playwright (headless Chromium)     | free/OSS           |
| Review sentiment      | `sentiment` (AFINN wordlist)       | free/OSS, no key   |
| Scam-report check     | curated JSON list + moderated user reports | free (stub) |
| LLM synthesis         | Ollama (local) or rule-based       | free/OSS           |
| Trust badge           | hand-rolled SVG (no image lib)     | free/OSS           |
| PDF export            | Playwright `page.pdf()`            | free/OSS           |
| Admin auth            | stateless HMAC cookie (no user DB) | free/OSS           |
| Caching + reports     | Postgres via Prisma                | free/OSS (self-hosted) |
| Domain parsing        | `tldts` (Public Suffix List)       | free/OSS           |

The only paid option anywhere in the stack is the optional `LLM_PROVIDER=anthropic`
path, which is off unless you explicitly configured it.

## Design — scanner console

A committed-dark, monospace "security scan console" — deliberately not another
boxed-navbar SaaS layout. Phosphor-green/amber/red glow on near-black, thin
HUD-style bordered panels with corner brackets (`src/components/Panel.tsx`), a
terminal titlebar nav, a scanline/CRT texture, and a live scan-sweep animation
while a check is running. The aesthetic **is the product**: this is literally a
security scanner, so the UI plays that back rather than looking like a generic
dashboard template.

The score-breakdown visualization (`src/components/ScoreBreakdownChart.tsx`) is
a horizontal composition bar of signal statuses (passed / flagged / no data),
chosen by design-system rules rather than by eye: it's a part-to-whole question
over a small fixed category set, so it wears the reserved *status* palette (not
categorical hues) and always pairs color with a `[OK]`/`[!!]`/`[--]` tag, never
color alone.

The PDF export (`src/components/PrintableReport.tsx`) is a deliberate exception
to the theme: a clean, light, printer-friendly document. A dispute/chargeback
paper trail should read as a professional report, not a screenshot of a
terminal — screen experience and document deliverable are different mediums.

## Architecture

```
src/
  app/
    page.tsx                    # input UI + live checklist + results view
    history/page.tsx            # recent scans + search/verdict filter (server component)
    compare/page.tsx            # side-by-side comparison (2-3 targets)
    report/[id]/page.tsx        # shareable permalink; ?print=1 renders PrintableReport
    admin/page.tsx              # scam-report moderation queue (password-gated)
    api/
      scan/route.ts             # POST /api/scan — rate limit, cache (bypassable via force:true), orchestrate
      report/route.ts           # POST /api/report — submit a crowd-sourced scam report
      badge/route.ts            # GET /api/badge?key=… — dynamic SVG trust badge
      report/[id]/pdf/route.ts  # GET — renders ?print=1 with Playwright, returns a PDF
      report/[id]/json/route.ts # GET — the raw ScanResult as a JSON download
      admin/login/route.ts      # POST — password → HMAC session cookie
      admin/logout/route.ts
      admin/reports/[id]/route.ts  # POST — approve/reject a pending report
  components/
    Panel.tsx                    # the one place the HUD-panel look is defined
    Header.tsx                   # terminal titlebar nav
    ResultsView.tsx               # score card, breakdown chart, signals, copy-link, badge, report form
    ScoreBreakdownChart.tsx      # status-composition bar (see Design above)
    PrintableReport.tsx          # light print/PDF document (distinct from the screen theme)
    AdminLoginForm.tsx / AdminReportRow.tsx / LogoutButton.tsx
  lib/
    input/detect.ts             # step 1: detect + normalize input
    signals/
      types.ts                  # SignalResult contract + runSignal() failure isolation
      whois.ts                  # step 2: domain age + WHOIS
      ssl.ts                    # step 3: SSL cert (tls handshake + crt.sh)
      dnsHealth.ts              # email & DNS setup (MX / SPF / DMARC / NS)
      fingerprint.ts            # step 4: Playwright site fingerprinting
      contactConsistency.ts     # step 5: email-domain vs site-domain check
      reviewSentiment.ts        # step 6: sentiment + uniform-rating detection
      reviewSource.ts           # swappable mock review data source
      scamReports.ts            # step 7: curated blocklist + moderated user reports
    data/scam-blocklist.json    # curated blocklist stub
    llm/
      provider.ts                # LlmProvider interface
      prompt.ts                  # synthesis prompt (explicit about data gaps)
      schema.ts                  # zod schema the LLM's JSON output must match
      ruleBasedProvider.ts       # always-available deterministic fallback
      ollamaProvider.ts          # free local LLM path (default)
      anthropicProvider.ts       # optional paid path
      synthesize.ts              # step 8 entry point — picks provider, falls back safely
    score/provisional.ts        # rule-based scorer (also the LLM fallback)
    cache/scanCache.ts          # 48h Postgres cache; also backs /history, /report/[id], /api/badge
    auth/adminSession.ts        # stateless HMAC admin session (no session DB)
    reportLookup.ts             # shared cache-row lookup (report page + PDF route)
    rateLimit.ts                 # in-memory per-IP rate limiter (namespaced per route)
    scan.ts                      # orchestrator: runs signals in parallel, then synthesizes
    modules-manifest.ts          # which modules exist + what input types they apply to
prisma/schema.prisma            # ScanCache + ScamReport (with moderation status) models
docker-compose.yml              # local Postgres for development
```

### Signal contract

Every signal module returns the same shape and never throws into the pipeline
(`runSignal` converts any error into a well-formed `unavailable` result), so one
dead source can never crash a scan:

```ts
{ signal_name, label, status: 'ok' | 'unavailable' | 'flag', data, notes, duration_ms }
```

### LLM synthesis (step 8)

`synthesizeScore()` reads `LLM_PROVIDER` (`ollama` | `anthropic` | unset/`none`)
and calls the matching provider. The prompt (`llm/prompt.ts`) explicitly instructs
the model to list every `unavailable` signal under `data_gaps` rather than guess,
and to lower `confidence` when fewer signals are usable. Any failure — unreachable
Ollama, missing Anthropic key, a malformed response — falls back to the
deterministic rule-based scorer with a note explaining why, rather than failing
the scan.

### Caching, permalinks, history, badges & rate limiting

- Results are cached in Postgres keyed by the normalized input (`ScanCache.normalizedKey`),
  TTL 48h. Pass `"force": true` to `/api/scan` (or use the "[ rescan fresh ]"
  button any cached result shows) to bypass the cache and scan fresh — the new
  result still refreshes the cache row, so permalinks and badges pick it up. Caching is optional infrastructure: without `DATABASE_URL`, or if the
  DB is unreachable, everything that depends on it (cache, `/history`, `/report/[id]`,
  `/api/badge`, scam reporting, admin) fails soft rather than crashing.
- Each cache row's `id` powers the `/report/[id]` shareable permalink and the
  `/history` list — both are plain server components reading Prisma directly.
- `/api/badge?key=<normalizedKey>` returns an SVG keyed the *same* way as the
  cache, so an embedded badge naturally reflects the latest scan for that
  target without a separate cache to keep in sync; unknown/expired keys render
  a neutral "scan me" badge (still valid, still 200) instead of a broken image.
- `/api/scan`, `/api/report`, `/api/report/[id]/pdf`, and admin login each
  rate-limit at 10 requests / 10 minutes per IP, independently namespaced
  (`scan:<ip>`, `report:<ip>`, `pdf:<ip>`, `admin-login:<ip>`) — in-memory,
  fine for a single instance; swap `rateLimit.ts` for a shared store like Redis
  behind multiple instances.

### Report a scam + moderation

`POST /api/report` lets a user flag any domain/handle as a scam, with an
optional free-text reason — stored as `pending` in the `ScamReport` table,
separate from the curated `scam-blocklist.json`. **Only `approved` reports
count toward the `scam_reports` signal** — a submission alone can't flag a
target, which closes an obvious abuse vector (mass-reporting a competitor).
`/admin` (gated by `ADMIN_PASSWORD`, a stateless HMAC session cookie — see
`src/lib/auth/adminSession.ts`) lists pending reports for a human to approve or
reject. This is intentionally a minimal single-admin gate, not a general auth
system.

### PDF export

Every permalink has a "download pdf" action hitting
`GET /api/report/[id]/pdf`, which launches headless Chromium (Playwright, an
existing dependency), navigates to `/report/[id]?print=1` — which renders
`PrintableReport.tsx` instead of the normal console UI, with the app header
hidden via a scoped `<style>` tag — and returns `page.pdf()` as a download.

## Try it

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"input":"github.com"}' | jq

# bypass the 48h cache:
curl -s -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"input":"github.com","force":true}' | jq

# raw JSON export of a saved report (id comes back from /api/scan):
curl -s http://localhost:3000/api/report/<id>/json | jq

curl -s -X POST http://localhost:3000/api/report \
  -H 'Content-Type: application/json' \
  -d '{"target":"some-sketchy-store.com","reason":"took payment, never shipped"}' | jq

# then approve it at http://localhost:3000/admin (ADMIN_PASSWORD required)

curl -s "http://localhost:3000/api/badge?key=github.com" | head -5
```

## What's still a stub (swap-ready, by design)

- **Review sentiment** runs against a deterministic mock data source
  (`src/lib/signals/reviewSource.ts`) — implement the `ReviewSource` interface
  with a real scraper/API and pass it into `checkReviewSentiment` to go live.
- **Scam-report cross-check**'s curated half matches against a tiny local JSON
  blocklist (`src/lib/data/scam-blocklist.json`) — implement `ScamReportSource`
  (`src/lib/signals/scamReports.ts`) with a real data source (FTC/BBB/threat-intel
  feed) to go live; the moderated user-report half is already real (backed by
  Postgres, reviewed at `/admin`).
