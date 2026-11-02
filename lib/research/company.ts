// Everything /research/[ticker] and its tabs need about one company, gathered
// once per request. Server-only.
//
// Wrapped in React's cache() so the layout (header and tabs) and the tab page
// below it share one set of lookups per request instead of repeating them.
// The expensive pieces are cached across requests one level down: the SEC
// rows in the database, the daily price history for a day, the quote for a
// minute, the profile for a day.

import { cache } from "react";
import { earningsReleaseDates, filesReportsFrom, getSubmissionsResult, getTickerMap, lookupCik } from "@/lib/sec/client";
import { getCompanyFinancials, NoFinancialsError, noFinancialsMessage, type CompanyFinancials } from "@/lib/sec";
import {
  fetchCompanyProfile,
  fetchNextEarnings,
  fetchQuoteSnapshot,
  type CompanyProfile,
  type NextEarnings,
  type QuoteSnapshot,
} from "@/lib/providers";
import { averageVolume, getDailyHistory, range52Week, type DailyBar } from "@/lib/analysis/tickerChart";
import { fiscalYearEndFromRows, titleCaseName } from "@/lib/research/format";

export type CompanyPage = {
  symbol: string;
  slug: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  fiscalYearEnd: string | null;
  cik: string | null;
  // A company that files 10-Ks and 10-Qs. Funds (SPY is in the SEC's ticker
  // file but files no company reports), indexes and anything else with only a
  // price get the price chart and none of the SEC tabs.
  filesReports: boolean;
  // The SEC couldn't be asked just now. The page then says so, rather than
  // claiming the company files no reports.
  secUnreachable: boolean;
  financials: CompanyFinancials | null;
  // Set for a filer whose statements can't be read yet (IFRS / 20-F).
  financialsUnavailable: string | null;
  quote: QuoteSnapshot | null;
  profile: CompanyProfile | null;
  daily: DailyBar[] | null;
  range52: { low: number; high: number } | null;
  avgVolume: number | null;
  // Past earnings dates from the company's own 8-K filings, and how far back
  // that list is complete; the next one from Finnhub's calendar.
  earnings: { dates: string[]; completeFrom: string | null };
  nextEarnings: NextEarnings | null;
};

// Finnhub's exchange names are long ("NASDAQ NMS - GLOBAL MARKET"); the SEC's
// are short ("Nasdaq"). Prefer the SEC's, in the usual capitals.
function displayExchange(sec: string | null | undefined, finnhub: string | null | undefined): string | null {
  const raw = sec || finnhub;
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.startsWith("NASDAQ")) return "NASDAQ";
  if (upper.startsWith("NYSE") || upper.includes("NEW YORK STOCK EXCHANGE")) return upper.startsWith("NYSE ARCA") ? "NYSE Arca" : "NYSE";
  if (upper === "OTC" || upper.includes("OTC")) return "OTC";
  if (upper.startsWith("CBOE")) return "Cboe";
  return raw;
}

// null when no such ticker exists anywhere: the caller turns that into a 404.
export const loadCompanyPage = cache(async (symbolRaw: string): Promise<CompanyPage | null> => {
  const symbol = symbolRaw.trim().toUpperCase();
  const [ref, quote, profile] = await Promise.all([lookupCik(symbol), fetchQuoteSnapshot(symbol), fetchCompanyProfile(symbol)]);

  // A symbol neither the SEC nor the quote feed knows is not a page. Checked
  // before anything touches Twelve Data, so a mistyped ticker costs none of
  // its eight requests a minute.
  if (!ref && !quote) return null;

  // "Couldn't reach the SEC" is not "files no reports": a company with a CIK
  // keeps its tabs during an outage, each saying its figures couldn't be
  // loaded, rather than 404ing as if it were a fund.
  const submissionsResult = ref ? await getSubmissionsResult(ref.cik) : null;
  const submissions = submissionsResult?.status === "ok" ? submissionsResult.submissions : null;
  const filesReports = filesReportsFrom(submissionsResult);
  // No CIK can also mean the SEC's ticker list couldn't be fetched (it's kept
  // a day, so rarely). Then the page can't know whether the company files.
  const secUnreachable = submissionsResult?.status === "unreachable" || (!ref && (await getTickerMap()) == null);

  let financials: CompanyFinancials | null = null;
  let financialsUnavailable: string | null = null;
  const [financialsResult, daily, nextEarnings] = await Promise.all([
    filesReports
      ? getCompanyFinancials(symbol).catch((err: unknown) => {
          if (err instanceof NoFinancialsError) return err;
          // The SEC being unreachable must not take the page down; the price
          // and header still render, and the tabs say the figures are missing.
          console.error(`[research] ${symbol}: financials failed:`, err instanceof Error ? err.message : err);
          return null;
        })
      : Promise.resolve(null),
    getDailyHistory(symbol),
    filesReports ? fetchNextEarnings(symbol) : Promise.resolve(null),
  ]);
  const name = profile?.name ?? (submissions?.name ? titleCaseName(submissions.name) : ref ? titleCaseName(ref.name) : symbol);

  if (financialsResult instanceof NoFinancialsError) financialsUnavailable = noFinancialsMessage(financialsResult.reason, name);
  else financials = financialsResult;
  const sector = profile?.industry ?? (submissions?.sicDescription ? titleCaseName(submissions.sicDescription) : null);

  return {
    symbol,
    slug: symbol.toLowerCase(),
    name,
    exchange: displayExchange(financials?.exchange ?? submissions?.exchanges?.[0], profile?.exchange),
    sector,
    fiscalYearEnd:
      (financials ? fiscalYearEndFromRows(financials.rows) : null) ?? submissions?.fiscalYearEnd ?? financials?.fiscalYearEnd ?? null,
    cik: ref?.cik ?? null,
    filesReports,
    secUnreachable,
    financials,
    financialsUnavailable,
    quote,
    profile,
    daily,
    range52: daily ? range52Week(daily, quote?.price ?? null) : null,
    avgVolume: daily ? averageVolume(daily) : null,
    earnings: submissions && filesReports ? earningsReleaseDates(submissions) : { dates: [], completeFrom: null },
    nextEarnings,
  };
});
