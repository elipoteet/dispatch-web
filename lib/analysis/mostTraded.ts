import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTickerSnapshot } from "@/lib/analysis/tickerSnapshot";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";

// docs/phase-eight.md. The right-rail "Most traded" panel — the day's top 6
// US stocks by dollar volume, sourced from Polygon's Daily Market Summary
// (one request covers every ticker for a session, so this costs the app
// exactly one external call a day and zero Twelve Data budget). Kept out of
// the rendering component so the pipeline is independently callable/
// testable, same split lib/social/dispatchAi.ts uses for its templates.

export type MostTradedRow = {
  symbol: string;
  name: string | null;
  close: number;
  changePct: number; // (close - open) / open, this SESSION's move — not a live quote
  dollarVolume: number;
  postCount: number;
};

export type MostTradedResult = {
  sessionDate: string; // YYYY-MM-DD, the session these numbers are FROM
  rows: MostTradedRow[];
};

// ============================================================
// Session date resolution
// ============================================================
// Polygon's free tier is end-of-day, not live — so "which session" has to
// be resolved deliberately rather than just using today's date, which
// returns nothing before a weekday's close and is flatly wrong on a
// weekend or holiday. Plain Date/Intl math — no date library exists in
// this repo (checked package.json) and none is needed for this.

const MARKET_CLOSE_HOUR_ET = 16; // 4:00pm ET

// Hand-maintained, like lib/social/handle.ts's RESERVED_HANDLES — a small
// list that needs occasional attention (re-derive next year's dates
// before this one runs out) rather than a holiday-calculation library.
// Missing an entry isn't a hard failure: worst case the panel shows one
// extra stale day until getMostTraded's caller notices, since Polygon
// itself will just return an empty/thin result for a real holiday.
const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed — Jul 4 falls on a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Calendar-only arithmetic (no timezone in play) — the input is already a
// plain YYYY-MM-DD, so this just walks the calendar, not real instants.
function stepDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun ... 6 = Sat
}

function isTradingDay(dateStr: string): boolean {
  const wd = weekdayOf(dateStr);
  if (wd === 0 || wd === 6) return false;
  if (NYSE_HOLIDAYS_2026.has(dateStr)) return false;
  return true;
}

// Walks a candidate date back to the most recent real trading day —
// capped so a gap in the (necessarily incomplete) holiday list can never
// spin forever.
function lastTradingDayOnOrBefore(dateStr: string): string {
  let d = dateStr;
  for (let i = 0; i < 10 && !isTradingDay(d); i++) d = stepDateStr(d, -1);
  return d;
}

// Exported for the panel's "flag this as a weekend/holiday fallback vs a
// same-day close" note — not just the date string.
export function resolveLastSession(now: Date = new Date()): { date: string; isSameDayClose: boolean } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const todayEt = toDateStr(Number(parts.year), Number(parts.month), Number(parts.day));
  // Intl can render midnight as "24" with hour12: false in some engines.
  const hourEt = parts.hour === "24" ? 0 : Number(parts.hour);

  const todayIsTradingDay = isTradingDay(todayEt);
  const marketClosedForToday = todayIsTradingDay && hourEt >= MARKET_CLOSE_HOUR_ET;

  if (marketClosedForToday) {
    return { date: todayEt, isSameDayClose: true };
  }
  // Before today's close (or today isn't a trading day at all) — the most
  // recent COMPLETE session is the trading day before today.
  const date = lastTradingDayOnOrBefore(stepDateStr(todayEt, -1));
  return { date, isSameDayClose: false };
}

export function formatSessionLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${month} ${d} close`;
}

// ============================================================
// Candidate filtering
// ============================================================
// A deny-list, not a taste call — getTickerSnapshot is Finnhub profile2/
// metrics-backed and returns almost nothing for an ETF or leveraged
// product, which is what the null-snapshot filter below catches
// automatically for anything this hand list misses. Needs occasional
// attention as new leveraged products launch — same posture as
// lib/social/handle.ts's RESERVED_HANDLES.
const ETF_DENY_LIST = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "VEA", "VWO", "EEM", "EFA", "AGG", "BND", "TLT", "IEF", "SHY", "LQD",
  "HYG", "XLF", "XLE", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC", "GLD", "SLV", "GDX", "USO",
  "UNG", "SMH", "SOXX", "IBIT", "FBTC", "ARKK", "ARKG", "ARKW", "JEPI", "JEPQ", "SCHD", "SPLG", "SPXL", "SPXS",
  "SPXU", "UPRO", "SDOW", "TQQQ", "SQQQ", "SOXL", "SOXS", "TNA", "TZA", "FAS", "FAZ", "UVXY", "SVXY", "VXX", "NVDL",
  "NVDU", "NVDD", "TSLL", "TSLQ", "TSLS", "BOIL", "KOLD",
]);

// ============================================================
// Polygon fetch + ranking — the whole pipeline is wrapped in
// unstable_cache below, keyed on session date, so it runs once a day
// regardless of how many eligible pages render it.
// ============================================================

type PolygonAggRow = { T: string; o: number; c: number; v: number };
type PolygonGroupedResponse = { results?: PolygonAggRow[] };

const CANDIDATE_POOL = 40; // how far down the dollar-volume ranking to look for 6 that resolve

async function computeMostTradedRaw(sessionDate: string): Promise<Omit<MostTradedRow, "postCount">[]> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("Polygon API key not configured.");

  console.log(`[cache] MISS computeMostTraded(${sessionDate}) — calling Polygon`);
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${sessionDate}?adjusted=true&apiKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Polygon HTTP " + res.status);
  const json = (await res.json()) as PolygonGroupedResponse;
  const results = Array.isArray(json.results) ? json.results : [];
  if (results.length === 0) throw new Error("Polygon returned no results for " + sessionDate);

  const ranked = results
    .filter((r) => TICKER_PATTERN.test(r.T) && !ETF_DENY_LIST.has(r.T) && r.c >= 5 && r.o > 0 && r.v > 0)
    .map((r) => ({
      symbol: r.T,
      close: r.c,
      changePct: (r.c - r.o) / r.o,
      dollarVolume: r.c * r.v,
    }))
    .sort((a, b) => b.dollarVolume - a.dollarVolume)
    .slice(0, CANDIDATE_POOL);

  const rows: Omit<MostTradedRow, "postCount">[] = [];
  for (const candidate of ranked) {
    if (rows.length >= 6) break;
    // A null snapshot means Finnhub has no real profile/name for this
    // symbol — the same signal /research/[ticker] already 404s on — so
    // this doubles as an automatic filter beyond ETF_DENY_LIST, catching
    // whatever the hand list misses (a warrant, a unit, an illiquid OTC
    // name that snuck past the price floor) without ever linking a row to
    // a ticker page that would come back broken.
    const snapshot = await getTickerSnapshot(candidate.symbol).catch(() => null);
    if (!snapshot || !snapshot.name) continue;
    rows.push({ symbol: candidate.symbol, name: snapshot.name, close: candidate.close, changePct: candidate.changePct, dollarVolume: candidate.dollarVolume });
  }
  return rows;
}

const cachedMostTraded = unstable_cache(computeMostTradedRaw, ["mostTraded"], {
  revalidate: 60 * 60 * 24,
});

// ============================================================
// Post counts — deliberately NOT cached (cheap, in-house query) so the
// chip reflects a fresh post immediately rather than waiting out the
// Polygon cache's daily TTL. Counts exact `ticker` column matches only —
// same convention lib/social/dispatchAi.ts's findBusiestBeat uses — not
// getPostsByTicker's looser body-ILIKE mention match; a simplification
// docs/phase-eight.md itself asks for ("one grouped query").
// ============================================================
async function getPostCounts(supabase: SupabaseClient, symbols: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (symbols.length === 0) return counts;
  const { data } = await supabase
    .from("posts")
    .select("ticker")
    .in("ticker", symbols)
    .is("space_id", null)
    .eq("generated", false)
    .is("deleted_at", null);
  for (const r of (data ?? []) as { ticker: string }[]) {
    counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
  }
  return counts;
}

// The one public export. Never throws — a Polygon outage, a missing key,
// or a thin/empty result all collapse into `null`, since there is no
// reliable error boundary to lean on here (this Next version's error.tsx
// has already proven unreliable elsewhere this project, and this is a
// sidebar, not the page).
export async function getMostTraded(supabase: SupabaseClient): Promise<MostTradedResult | null> {
  try {
    const { date } = resolveLastSession();
    const base = await cachedMostTraded(date);
    const counts = await getPostCounts(supabase, base.map((r) => r.symbol));
    return {
      sessionDate: date,
      rows: base.map((r) => ({ ...r, postCount: counts.get(r.symbol) ?? 0 })),
    };
  } catch {
    return null;
  }
}
