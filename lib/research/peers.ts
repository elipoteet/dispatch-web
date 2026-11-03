// The Valuation tab's peer table (phase nine, stage 4). Server-only.
//
// Finnhub names the peers; their figures come from the SEC rows this site has
// already stored. A peer nobody has opened yet isn't stored, and fetching six
// companies' SEC files while the visitor waits would make the page slow and
// spend the SEC's ten-a-second allowance in a burst. So a missing peer shows
// as "loading", its files are fetched one at a time after the page has been
// sent (Next's after()), and it's there for the next visitor.

import { after } from "next/server";
import { TICKER_PATTERN } from "@/lib/ticker";
import { getSubmissions, latestFiling, lookupCik } from "@/lib/sec/client";
import { getCompanyFinancials, NORMALIZER_VERSION } from "@/lib/sec";
import { getStoredCompany, getStoredFinancials } from "@/lib/sec/store";
import type { LineItem } from "@/lib/sec/concepts";
import { fetchCompanyProfile, fetchPeers, fetchQuoteSnapshot } from "@/lib/providers";
import { finnhubShareCount, sharesToday, todayFigures, type SharesToday, type TodayFigures } from "@/lib/research/valuation";
import { titleCaseName } from "@/lib/research/format";

export const MAX_PEERS = 6;

// Finnhub lists ten or so; looking at a few past six leaves room for the ones
// that turn out to be funds or foreign filers.
const CANDIDATES = 10;

const PEER_ITEMS: LineItem[] = [
  "revenue",
  "net_income",
  "free_cash_flow",
  "buybacks",
  "total_debt",
  "cash_and_equivalents",
  "total_equity",
  "shares_outstanding",
];

// What a peer with no figures lacks, so the table can say (review of
// 2 November 2026: ExxonMobil read "No current price" when it had a price;
// its new 2026 SEC registration had no filings yet).
export type PeerMissing = "price" | "filings" | "shares" | "trailing";

export type PeerRow =
  | { symbol: string; name: string; status: "ready"; figures: TodayFigures }
  | { symbol: string; name: string; status: "loading" }
  | { symbol: string; name: string; status: "missing"; missing: PeerMissing };

export function peerMissing(input: { price: number | null; rowCount: number; shares: SharesToday | null; figures: TodayFigures | null }): PeerMissing | null {
  if (input.figures) return null;
  if (input.price == null) return "price";
  if (input.rowCount === 0) return "filings";
  if (!input.shares) return "shares";
  return "trailing";
}

// The company's own spelling where the SEC has it: its ticker list writes
// "ExxonMobil Holdings Corp", where Finnhub has "Exxonmobil Holdings Corp".
// A name the SEC holds only in capitals ("CHEVRON CORP") takes Finnhub's.
export function peerName(sec: string, finnhub: string | null | undefined): string {
  if (/[a-z]/.test(sec)) return titleCaseName(sec);
  return finnhub || titleCaseName(sec);
}

// Per server instance: two visitors on the same instance don't load the same
// peer twice. Across instances the database upsert makes a repeat harmless.
const inFlight = new Set<string>();

function loadInBackground(symbols: string[]) {
  if (symbols.length === 0) return;
  after(async () => {
    for (const symbol of symbols) {
      if (inFlight.has(symbol)) continue;
      inFlight.add(symbol);
      try {
        await getCompanyFinancials(symbol);
        console.log(`[peers] loaded ${symbol} in the background`);
      } catch (err) {
        console.error(`[peers] ${symbol}:`, err instanceof Error ? err.message : err);
      } finally {
        inFlight.delete(symbol);
      }
    }
  });
}

// `background`: whether to load missing peers after the response. Off for a
// crawler's visit (lib/research/crawler.ts), which sees stored peers only.
export async function loadPeers(symbol: string, cik: string, options: { background: boolean } = { background: true }): Promise<PeerRow[] | null> {
  const listed = await fetchPeers(symbol);
  if (!listed) return null;
  const candidates = [...new Set(listed)].filter((s) => s !== symbol && TICKER_PATTERN.test(s)).slice(0, CANDIDATES);
  const asOf = new Date().toISOString().slice(0, 10);

  // Which candidates are U.S. filers, and which are stored already.
  const checked = await Promise.all(
    candidates.map(async (s) => {
      const ref = await lookupCik(s);
      if (!ref) return null; // a fund, or a listing the SEC doesn't cover
      // Another class of the same company (BRK.A beside BRK.B) is not a peer.
      if (ref.cik === cik) return null;
      const stored = await getStoredCompany(ref.cik);
      if (stored) return { symbol: s, ref, stored };
      // Not stored: worth loading only if it files 10-Ks. A 20-F filer would
      // sit at "loading" forever.
      const subs = await getSubmissions(ref.cik);
      if (!subs || !latestFiling(subs, ["10-K", "10-Q"])) return null;
      return { symbol: s, ref, stored: null };
    }),
  );
  const chosen = checked.filter((c) => c != null).slice(0, MAX_PEERS);

  const toLoad: string[] = [];
  const rows = await Promise.all(
    chosen.map(async ({ symbol: s, ref, stored }): Promise<PeerRow> => {
      if (!stored) {
        toLoad.push(s);
        return { symbol: s, name: peerName(ref.name, (await fetchCompanyProfile(s))?.name), status: "loading" };
      }
      // Stored before the debt and cover-share figures existed: show what's
      // there and refresh it behind the scenes.
      if (!stored.latestAccession?.endsWith(`#n${NORMALIZER_VERSION}`)) toLoad.push(s);

      const [rows, quote, profile] = await Promise.all([
        getStoredFinancials(ref.cik, { lineItems: PEER_ITEMS }),
        fetchQuoteSnapshot(s),
        fetchCompanyProfile(s),
      ]);
      const name = peerName(ref.name, profile?.name);
      const finnhubShares = finnhubShareCount(profile, quote?.price ?? null);
      // No split check for a peer: one price request each would be six of
      // Twelve Data's eight a minute. The cover count is checked against
      // Finnhub's instead, which catches a split since the last filing.
      const shares = sharesToday({ rows, steps: null, finnhubShares, asOf });
      const figures = quote && shares ? todayFigures({ rows, price: quote.price, shares: shares.shares }) : null;
      const missing = peerMissing({ price: quote?.price ?? null, rowCount: rows.length, shares, figures });
      if (missing || !figures) return { symbol: s, name, status: "missing", missing: missing ?? "trailing" };
      return { symbol: s, name, status: "ready", figures };
    }),
  );

  if (options.background) loadInBackground(toLoad);
  return rows;
}
