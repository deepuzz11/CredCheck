import { runSignal, type SignalResult } from "./types";
import blocklist from "@/lib/data/scam-blocklist.json";
import { prisma } from "@/lib/db/prisma";

/**
 * Step 7 — Scam-report cross-check.
 *
 * Defined behind a `ScamReportSource` interface so today's local JSON
 * blocklist can be swapped for a real data source later (e.g. FTC/BBB
 * reports, community-reported databases, a threat-intel feed) without
 * touching the calling code — only a new class needs to be written and
 * passed in.
 */

export interface ScamReportMatch {
  source: string;
  note: string;
}

export interface ScamReportSource {
  check(target: { domain?: string; handle?: string }): Promise<ScamReportMatch[]>;
}

/** The curated, developer-maintained list (src/lib/data/scam-blocklist.json). */
class LocalBlocklistSource implements ScamReportSource {
  async check(target: { domain?: string; handle?: string }): Promise<ScamReportMatch[]> {
    const matches: ScamReportMatch[] = [];
    if (target.domain && blocklist.domains.includes(target.domain.toLowerCase())) {
      matches.push({
        source: "curated_blocklist",
        note: `Domain ${target.domain} appears on the curated scam-report blocklist.`,
      });
    }
    if (
      target.handle &&
      blocklist.instagram_handles.includes(target.handle.toLowerCase())
    ) {
      matches.push({
        source: "curated_blocklist",
        note: `Handle @${target.handle} appears on the curated scam-report blocklist.`,
      });
    }
    return matches;
  }
}

/**
 * Crowd-sourced reports submitted via POST /api/report. Anyone can submit
 * one, but only reports an admin has approved at /admin count toward this
 * signal — an unmoderated report can't flag a target on its own, closing an
 * obvious abuse vector (flagging a competitor, mass-reporting). Degrades to
 * no matches (rather than failing the whole signal) if the DB is
 * unreachable — same "never crash the scan" contract as everything else.
 */
class UserReportedSource implements ScamReportSource {
  async check(target: { domain?: string; handle?: string }): Promise<ScamReportMatch[]> {
    if (!process.env.DATABASE_URL) return [];
    const candidates = [target.domain, target.handle].filter(
      (t): t is string => Boolean(t),
    );
    if (candidates.length === 0) return [];

    try {
      const reports = await prisma.scamReport.findMany({
        where: { target: { in: candidates.map((c) => c.toLowerCase()) }, status: "approved" },
      });
      if (reports.length === 0) return [];
      return [
        {
          source: "user_reports",
          note: `${reports.length} moderator-approved user report${reports.length === 1 ? "" : "s"} of this as a scam (crowd-sourced).`,
        },
      ];
    } catch (err) {
      console.warn(
        "[scamReports] user-report lookup failed, skipping:",
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }
}

/** Combines the curated list with crowd-sourced reports. */
class CombinedSource implements ScamReportSource {
  constructor(private sources: ScamReportSource[]) {}
  async check(target: { domain?: string; handle?: string }): Promise<ScamReportMatch[]> {
    const results = await Promise.all(this.sources.map((s) => s.check(target)));
    return results.flat();
  }
}

/** Default source for the MVP — swap/extend this to go live with a real feed. */
export const scamReportSource: ScamReportSource = new CombinedSource([
  new LocalBlocklistSource(),
  new UserReportedSource(),
]);

export interface ScamReportData {
  checked_domain: string | null;
  checked_handle: string | null;
  matches: ScamReportMatch[];
  source: string;
}

export async function checkScamReports(
  target: { domain?: string; handle?: string },
  source: ScamReportSource = scamReportSource,
): Promise<SignalResult<ScamReportData>> {
  return runSignal<ScamReportData>(
    { signal_name: "scam_reports", label: "Scam-report cross-check" },
    async () => {
      const matches = await source.check(target);

      const data: ScamReportData = {
        checked_domain: target.domain ?? null,
        checked_handle: target.handle ?? null,
        matches,
        source: "curated blocklist + user reports (stub — swap for a real feed later)",
      };

      if (matches.length > 0) {
        return {
          status: "flag",
          data,
          notes: matches.map((m) => m.note).join(" "),
        };
      }

      return {
        status: "ok",
        data,
        notes:
          "No matches on the curated blocklist or user reports. Note: these are small/early data sources, not a comprehensive scam database yet.",
      };
    },
  );
}
