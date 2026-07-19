"use client";

import { useEffect, useState } from "react";
import {
  getWatchlist,
  removeWatch,
  WATCHLIST_EVENT,
  type WatchItem,
} from "@/lib/watchlist";
import { Panel } from "./Panel";

const BAND_CLS: Record<string, string> = {
  trusted: "text-emerald-400",
  caution: "text-amber-400",
  high: "text-red-400",
};

/**
 * The visitor's personal watchlist, rendered on the home page. Lives entirely
 * in localStorage (see lib/watchlist.ts) — renders nothing when empty, so
 * first-time visitors never see it.
 */
export function WatchlistPanel({ onRescan }: { onRescan: (raw: string) => void }) {
  const [items, setItems] = useState<WatchItem[] | null>(null);

  useEffect(() => {
    const sync = () => setItems(getWatchlist());
    sync();
    window.addEventListener(WATCHLIST_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_EVENT, sync);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-6">
      <Panel label="watchlist" className="p-4">
        <ul className="space-y-1.5">
          {items.map((w) => (
            <li key={w.key} className="flex items-baseline gap-2.5 text-xs">
              <span
                className={`w-7 shrink-0 text-right font-bold tabular-nums ${BAND_CLS[w.band ?? ""] ?? "text-emerald-100/40"}`}
              >
                {typeof w.score === "number" ? w.score : "--"}
              </span>
              <span className="truncate text-emerald-100/70">{w.key}</span>
              {w.scanned_at && (
                <span className="shrink-0 text-[10px] text-emerald-100/30">
                  {new Date(w.scanned_at).toLocaleDateString()}
                </span>
              )}
              <span className="ml-auto flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onRescan(w.raw)}
                  className="text-sky-300/80 transition hover:text-sky-300"
                  title="Rescan this target now"
                >
                  [↻]
                </button>
                <button
                  type="button"
                  onClick={() => removeWatch(w.key)}
                  className="text-red-300/60 transition hover:text-red-300"
                  title="Remove from watchlist"
                >
                  [x]
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[10px] text-emerald-100/30">
          &gt; stored only in this browser — click ↻ to rescan a target
        </p>
      </Panel>
    </div>
  );
}
