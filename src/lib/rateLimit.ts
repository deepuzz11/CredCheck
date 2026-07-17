/**
 * In-memory rate limiter for POST /api/scan — free, no external dependency.
 *
 * A scan is expensive (WHOIS + TLS handshake + crt.sh + a headless-browser
 * page load + sentiment analysis + an LLM call), so it's worth capping per-IP
 * request rate to protect the server and any upstream free APIs from abuse.
 *
 * LIMITATION: this state lives in the Node process's memory, so it resets on
 * restart and isn't shared across multiple server instances. That's fine for
 * a single-instance MVP; a multi-instance deployment should swap this for a
 * shared store (e.g. Redis) behind the same `checkRateLimit` interface.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 10; // per IP, per window

const buckets = new Map<string, Bucket>();
let callsSinceSweep = 0;

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map doesn't grow unbounded with one-off IPs.
  callsSinceSweep++;
  if (callsSinceSweep >= 200) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count };
}

/** Best-effort client IP extraction behind common reverse-proxy headers. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  // No proxy header (e.g. local dev without a reverse proxy) — fall back to
  // a single shared bucket rather than skipping rate limiting entirely.
  return "unknown";
}
