// Recently viewed companies (phase ten, Stage B).
//
// Kept in the visitor's own browser (localStorage) and nowhere else: it needs
// no account, works the same signed in or out, and never reaches the server
// or the database. Client-only in practice; on the server every read is empty.
//
// Storage can be missing (a private window), blocked (site data turned off,
// where even touching window.localStorage throws) or hold anything at all, so
// every access sits in try/catch and every entry is checked before use. A bad
// value gives an empty list, never an error. Names are display text only:
// React escapes them, and nothing here may pass one to dangerouslySetInnerHTML.

import { TICKER_PATTERN } from "@/lib/ticker";

export const RECENT_KEY = "dispatch.recent.v1";
// How many are kept, how many the home page and /research show, and how many
// the search box's dropdown shows.
export const RECENT_KEEP = 12;
export const RECENT_SHOW = 8;
export const RECENT_IN_SEARCH = 5;

export const RECENT_TABS = ["overview", "financials", "valuation", "earnings", "insiders", "filings"] as const;
export type RecentTab = (typeof RECENT_TABS)[number];

export type RecentEntry = {
  // Uppercase, as TICKER_PATTERN wants it.
  symbol: string;
  name: string;
  tab: RecentTab;
  // Milliseconds since 1970, from the visitor's own clock.
  viewedAt: number;
};

const TAB_LABELS: Record<RecentTab, string> = {
  overview: "Overview",
  financials: "Financials",
  valuation: "Valuation",
  earnings: "Earnings",
  insiders: "Insiders",
  filings: "Filings",
};

// Lets every list on the page hear a change made in this tab; the browser's
// own "storage" event only reaches other tabs.
const CHANGE_EVENT = "dispatch:recent";
const MAX_NAME = 200;

function isTab(value: unknown): value is RecentTab {
  return typeof value === "string" && (RECENT_TABS as readonly string[]).includes(value);
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(RECENT_KEY);
  } catch {
    return null;
  }
}

function notify(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Nothing is listening that can't catch up on the next read.
  }
}

function toEntry(value: unknown): RecentEntry | null {
  if (!value || typeof value !== "object") return null;
  const { symbol, name, tab, viewedAt } = value as Record<string, unknown>;
  if (typeof symbol !== "string") return null;
  const upper = symbol.trim().toUpperCase();
  if (!TICKER_PATTERN.test(upper)) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME) return null;
  if (!isTab(tab)) return null;
  if (typeof viewedAt !== "number" || !Number.isFinite(viewedAt) || viewedAt <= 0) return null;
  return { symbol: upper, name: trimmed, tab, viewedAt };
}

// Newest first, one entry per company, at most RECENT_KEEP. Anything that
// isn't the right shape is dropped rather than repaired.
export function parseRecent(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const entries = data.map(toEntry).filter((e): e is RecentEntry => e !== null);
  entries.sort((a, b) => b.viewedAt - a.viewedAt);
  const seen = new Set<string>();
  const out: RecentEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.symbol)) continue;
    seen.add(e.symbol);
    out.push(e);
    if (out.length === RECENT_KEEP) break;
  }
  return out;
}

const EMPTY: RecentEntry[] = [];
let snapshotRaw: string | null = null;
let snapshotList: RecentEntry[] = EMPTY;

// For useSyncExternalStore: the same array for as long as the stored string
// is unchanged. A fresh array on every call would re-render forever.
export function getRecentSnapshot(): RecentEntry[] {
  const raw = readRaw();
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotList = raw ? parseRecent(raw) : EMPTY;
  }
  return snapshotList;
}

// The server has no storage: one shared empty list, so the first render on
// the client matches it and the list fills in after hydration.
export function getServerRecentSnapshot(): RecentEntry[] {
  return EMPTY;
}

export function subscribeRecent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === RECENT_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(list: RecentEntry[]): void {
  const s = storage();
  if (!s) return;
  try {
    if (list.length === 0) s.removeItem(RECENT_KEY);
    else s.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Full or blocked storage: the list just doesn't change.
    return;
  }
  notify();
}

export function readRecent(): RecentEntry[] {
  return getRecentSnapshot();
}

// Puts the company at the top, with the tab it's on now. One already in the
// list moves up rather than appearing twice.
export function addRecent(entry: { symbol: string; name: string; tab: RecentTab; viewedAt?: number }): RecentEntry[] {
  const e = toEntry({ ...entry, viewedAt: entry.viewedAt ?? Date.now() });
  const current = readRecent();
  if (!e) return current;
  const list = [e, ...current.filter((x) => x.symbol !== e.symbol)].slice(0, RECENT_KEEP);
  write(list);
  return list;
}

export function removeRecent(symbol: string): RecentEntry[] {
  const upper = symbol.trim().toUpperCase();
  const list = readRecent().filter((x) => x.symbol !== upper);
  write(list);
  return list;
}

export function clearRecent(): void {
  write([]);
}

// The tab a company page's address is on: /research/nvda is the Overview,
// /research/nvda/insiders the Insiders tab. Anything else isn't a tab.
export function tabFromPath(pathname: string | null | undefined): RecentTab | null {
  const parts = (pathname ?? "").split("/").filter(Boolean);
  if (parts[0] !== "research" || parts.length < 2 || parts.length > 3) return null;
  if (parts.length === 2) return "overview";
  const tab = parts[2];
  return isTab(tab) && tab !== "overview" ? tab : null;
}

export function recentHref(entry: Pick<RecentEntry, "symbol" | "tab">): string {
  const base = `/research/${encodeURIComponent(entry.symbol.toLowerCase())}`;
  return entry.tab === "overview" ? base : `${base}/${entry.tab}`;
}

export function tabLabel(tab: RecentTab): string {
  return TAB_LABELS[tab];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago",
// "Last week", then the date. Days are counted on the visitor's calendar.
export function viewedLabel(viewedAt: number, now: number = Date.now()): string {
  const diff = now - viewedAt;
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  // Rounded: a day either side of a clock change is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - startOfDay(viewedAt)) / (24 * HOUR));
  if (days <= 0) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  const then = new Date(viewedAt);
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
