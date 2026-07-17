import crypto from "node:crypto";

/**
 * Minimal single-admin auth: one shared password (ADMIN_PASSWORD), gating
 * the /admin moderation queue. No user accounts, no DB-backed sessions —
 * the session cookie is a stateless HMAC derived from the password itself,
 * so it can be verified without storing anything. This is intentionally
 * lightweight for an MVP moderation gate, not a general-purpose auth system.
 */

export const ADMIN_COOKIE_NAME = "credcheck_admin";

function sessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return crypto.createHmac("sha256", password).update("credcheck-admin-session").digest("hex");
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPassword(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return timingSafeStringEqual(candidate, password);
}

/** The value to set as the session cookie after a successful login. */
export function issueSessionCookie(): string | null {
  return sessionToken();
}

export function verifySessionCookie(value: string | undefined | null): boolean {
  const expected = sessionToken();
  if (!expected || !value) return false;
  return timingSafeStringEqual(value, expected);
}
