"use client";

import { useEffect, useState } from "react";
import type { RecentScan } from "@/app/api/recent/route";
import { Panel } from "./Panel";

const BAND_CLS: Record<string, string> = {
  trusted: "text-emerald-400 border-emerald-400/30",
  caution: "text-amber-400 border-amber-400/30",
  high: "text-red-400 border-red-400/30",
};

/**
 * A strip of the latest community scans under the prompt — social proof for
 * first-time visitors and one-click examples of real reports. Renders
 * nothing at all until data arrives (and never when caching is disabled),
 * so the home page is unchanged in a zero-config setup.
 */
export function RecentScans() {
  const [scans, setScans] = useState<RecentScan[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recent")
      .then((r) => (r.ok ? r.json() : { scans: [] }))
      .then((json: { scans: RecentScan[] }) => {
        if (!cancelled) setScans(json.scans);
      })
      .catch(() => {
        if (!cancelled) setScans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!scans || scans.length === 0) return null;

  return (
    <div className="mt-6">
      <Panel label="recent activity" className="p-4">
        <ul className="flex flex-wrap gap-2">
          {scans.map((s) => (
            <li key={s.id}>
              <a
                href={`/report/${s.id}`}
                className={`inline-flex items-center gap-2 border bg-black/40 px-2.5 py-1.5 text-xs transition hover:bg-emerald-400/5 ${BAND_CLS[s.risk_band] ?? BAND_CLS.caution}`}
              >
                <span className="font-bold tabular-nums">{s.trust_score}</span>
                <span className="max-w-[16rem] truncate text-emerald-100/70">{s.key}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[10px] text-emerald-100/30">
          &gt; latest community scans — click any to open its report
        </p>
      </Panel>
    </div>
  );
}
