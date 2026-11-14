// One ticker per company, for the screener. Pure.
//
// The frames identify companies by CIK, and many companies have more than one
// listed symbol: share classes, preferred shares, notes. The rule: the
// company's first row in the SEC's company_tickers_exchange.json. The SEC
// orders that file largest company first and, within a company, puts the main
// share class first. Checked 5 November 2026:
//   Alphabet  GOOGL, GOOG, GOOGM, GOOGN  -> GOOGL
//   Berkshire BRK-B, BRK-A               -> BRK-B
//   Fox       FOXA, FOX                  -> FOXA
//   News Corp NWSA, NWS, NWSLL           -> NWSA
//   Under Armour UAA, UA                 -> UAA
//   JPMorgan  JPM (preferred shares not in this file) -> JPM
// One known oddity: Zillow lists ZG before Z, so ZG it is. Either symbol
// opens the same research file, because the site maps both to the same CIK.
//
// A company with no row has no listed ticker and is left out (the brief).

import type { TickerExchangeFile } from "@/lib/sec/client";

export type ListedTicker = { ticker: string; exchange: string | null; name: string };

// Exchanges where shares are listed rather than quoted over the counter.
export const EXCHANGES = new Set(["Nasdaq", "NYSE", "CBOE", "TXSE"]);

export function tickerByCik(file: TickerExchangeFile): Map<number, ListedTicker> {
  const fields = file.fields ?? [];
  const at = (name: string, fallback: number) => {
    const i = fields.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iCik = at("cik", 0);
  const iName = at("name", 1);
  const iTicker = at("ticker", 2);
  const iExchange = at("exchange", 3);
  const out = new Map<number, ListedTicker>();
  for (const row of file.data ?? []) {
    const cik = Number(row[iCik]);
    const ticker = String(row[iTicker] ?? "").trim();
    if (!Number.isFinite(cik) || !ticker || out.has(cik)) continue;
    out.set(cik, { ticker, exchange: (row[iExchange] as string | null) ?? null, name: String(row[iName] ?? "") });
  }
  return out;
}

// —— A ticker that moved to a new holding company ——
// When a company reorganises under a new holding company, the SEC's ticker
// file moves the symbol to the new company at once, while the annual
// figures stay with the old one until the new one files its first 10-K. In
// between, the company would vanish from the screener. ExxonMobil did this
// in 2026: XOM now points to ExxonMobil Holdings Corp (CIK 2115436), whose
// first annual report isn't out, while Exxon Mobil Corporation (34088) filed
// the 2025 10-K. Checked 7 November 2026 across every filer with $5 billion of
// 2025 revenue and no ticker: the only such case. new CIK -> old CIK.
export const SUCCESSIONS: ReadonlyMap<number, number> = new Map([[2115436, 34088]]);

// Lends the new company's ticker to the old one while only the old one has
// annual figures; once the new one files, the ticker is its own again.
export function withPredecessors(listed: Map<number, ListedTicker>, hasFigures: (cik: number) => boolean): Map<number, ListedTicker> {
  const out = new Map(listed);
  for (const [successor, predecessor] of SUCCESSIONS) {
    const t = listed.get(successor);
    if (t && !hasFigures(successor) && !listed.has(predecessor)) out.set(predecessor, t);
  }
  return out;
}
