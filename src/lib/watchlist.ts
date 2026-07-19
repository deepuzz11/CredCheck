"use client";

/**
 * Client-only watchlist — a localStorage list of targets the visitor wants to
 * keep an eye on, with the last score they saw. Deliberately not a backend
 * feature: no accounts, nothing leaves the browser, works with zero config.
 * Every mutation dispatches "credcheck:watchlist" so any mounted panel stays
 * in sync without a store library.
 */

export interface WatchItem {
  /** what the user originally pasted — replayable through the scanner */
  raw: string;
  /** normalized cache key, the stable identity */
  key: string;
  score?: number;
  band?: string;
  scanned_at?: string;
}

const STORAGE_KEY = "credcheck.watchlist.v1";
const MAX_ITEMS = 24;
export const WATCHLIST_EVENT = "credcheck:watchlist";

function read(): WatchItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: WatchItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new Event(WATCHLIST_EVENT));
  } catch {
    /* storage full / disabled — watchlist is best-effort */
  }
}

export function getWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return [];
  return read();
}

export function isWatched(key: string): boolean {
  return getWatchlist().some((w) => w.key === key);
}

/** Add or remove; returns true when the target is now watched. */
export function toggleWatch(item: WatchItem): boolean {
  const items = getWatchlist();
  const existing = items.findIndex((w) => w.key === item.key);
  if (existing >= 0) {
    items.splice(existing, 1);
    write(items);
    return false;
  }
  write([item, ...items]);
  return true;
}

export function removeWatch(key: string) {
  write(getWatchlist().filter((w) => w.key !== key));
}

/** Refresh the stored snapshot after a completed scan of a watched target. */
export function updateWatch(key: string, patch: Partial<WatchItem>) {
  const items = getWatchlist();
  const idx = items.findIndex((w) => w.key === key);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch };
  write(items);
}
