/**
 * Single source of truth for which signal modules exist. The UI uses this to
 * (a) show a live "checks running" list and (b) be honest in the
 * "what we couldn't check" section about what isn't built yet.
 *
 * As each MVP step lands, flip `built` to true (and the loading UI + results
 * automatically reflect it).
 */
export interface ModuleInfo {
  key: string;
  label: string;
  built: boolean;
  /** which input types this check applies to */
  appliesTo: Array<"website" | "instagram" | "marketplace">;
}

export const MODULES: ModuleInfo[] = [
  { key: "domain_age", label: "Domain age & WHOIS", built: true, appliesTo: ["website", "marketplace"] },
  { key: "ssl_cert", label: "SSL certificate", built: true, appliesTo: ["website", "marketplace"] },
  { key: "dns_health", label: "Email & DNS setup", built: true, appliesTo: ["website", "marketplace"] },
  { key: "site_fingerprint", label: "Site policies & contact info", built: true, appliesTo: ["website"] },
  { key: "contact_consistency", label: "Contact consistency", built: true, appliesTo: ["website"] },
  { key: "review_sentiment", label: "Review sentiment", built: true, appliesTo: ["website", "instagram", "marketplace"] },
  { key: "scam_reports", label: "Scam-report cross-check", built: true, appliesTo: ["website", "instagram", "marketplace"] },
  { key: "llm_synthesis", label: "AI synthesis", built: true, appliesTo: ["website", "instagram", "marketplace"] },
];
