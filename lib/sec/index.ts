// The one function the rest of the site calls. Server-only.
//
// getCompanyFinancials("NVDA") -> ten years of clean, comparable figures,
// whatever it takes to get them: a cache hit, a database read, or a full fetch
// and normalise on first sight of a company.
//
// Stage 1 has no UI. This is the seam the Financials, Valuation and Earnings
// tabs will all sit on in later stages.

import {
  fetchCompanyFacts,
  getSubmissions,
  latestFiling,
  lookupCik,
  NoSecDataError,
  type FilingRef,
  type Submissions,
} from "@/lib/sec/client";
import { normalizeCompanyFacts, type CompanyFacts, type FinancialRow } from "@/lib/sec/normalize";
import { filerKindFromSic, suppressedItems, type FilerKind, type LineItem } from "@/lib/sec/concepts";
import { getStoredCompany, getStoredFinancials, saveFinancials, upsertCompany } from "@/lib/sec/store";
import { fetchFinancialsReported } from "@/lib/providers";
import { indexAnnualFilings, mergeCapexFromFilings, yearsMissingCapex } from "@/lib/sec/capexFallback";

export type CompanyFinancials = {
  cik: string;
  symbol: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  filerKind: FilerKind;
  // Non-null when some line items are deliberately not shown for this kind of
  // company. The page states the reason rather than leaving a silent gap.
  suppression: { items: LineItem[]; reason: string } | null;
  rows: FinancialRow[];
  // Where this answer came from, so a slow first load can be explained and the
  // refresh path can be verified without guessing.
  source: "store" | "sec";
  // Read fresh from the (cached) submissions file on every call rather than
  // stored: the listing exchange, and the newest annual report, which the
  // Overview's description is generated from and every source line links to.
  exchange: string | null;
  latestAnnual: FilingRef | null;
};

// —— Refreshing companies already stored when the normaliser changes ——
// A stored company is normally re-read only when it files something new. That
// alone would mean a line item added later (buybacks, stage 2) never reaches a
// company stored before it existed. So the stored accession carries the
// normaliser's version, and a mismatch triggers exactly one refresh.
//
// Kept in the existing latest_accession column rather than a new one: adding a
// column means altering a table that is already live, which this project does
// only with Eli's sign-off. Bump this whenever the normaliser's output changes.
// 2: buybacks (stage 2). 3: total_debt and cover-page shares_outstanding, and
// no more quarterly share counts derived by subtraction (stage 4). 4: a year's
// quarters taken from a second tag when its full-year total matches (stage 4).
// 5: Q2 and Q4 of cash-flow items unwound correctly from year-to-date totals
// (stage 4; wrong since stage 1). 6: debt taken per balance-sheet date, and any
// missing quarter from a second tag whose full year matches (stage 4).
// 7: diluted earnings per share (stage 5). 8: EPS stored as filed only, no
// derived Q4 (stage 5; a split made it wrong). 9: cash worked out from the
// restricted-cash total where the cash line's own tag is missing (Chevron's
// 2019 and 2024; review of 2 November 2026). 10: a year whose revenue, net
// income or operating cash flow tags disagree by a units factor is settled
// from the filing's own arithmetic, or left blank (lib/sec/units.ts; Tigo
// Energy's 2025 revenue, 5 November 2026).
export const NORMALIZER_VERSION = 10;

export function accessionStamp(accession: string): string {
  return `${accession}#n${NORMALIZER_VERSION}`;
}

const ANNUAL_FORMS = ["10-K", "10-K/A", "10-KT"];

function exchangeOf(submissions: Submissions | null, symbol: string): string | null {
  const tickers = submissions?.tickers ?? [];
  const exchanges = submissions?.exchanges ?? [];
  const i = tickers.findIndex((t) => t.toUpperCase() === symbol);
  return (i >= 0 ? exchanges[i] : exchanges[0]) ?? null;
}

// Foreign private issuers file 20-F on the IFRS taxonomy; the us-gaap tag lists
// in concepts.ts do not apply to them and would silently return almost nothing.
// Out of scope for v1, per the brief — detected and stated, never half-rendered.
//
// Detected by the taxonomy itself. Stage 1 inferred it from "facts but no
// rows", which turned out to mislabel a different case: ExxonMobil
// reorganised under a new holding company in 2026, and the new registration
// has one 10-Q and no 10-K yet, so it has us-gaap facts but no full year to
// build a history from. That is not an IFRS filer, and saying so was false.
function isIfrsFiler(facts: CompanyFacts): boolean {
  return Boolean(facts.facts["ifrs-full"]) && Object.keys(facts.facts["us-gaap"] ?? {}).length === 0;
}

export type NoFinancialsReason = "ifrs" | "no-annual";

// The sentence a page shows, given the name it displays for the company.
export function noFinancialsMessage(reason: NoFinancialsReason, name: string): string {
  return reason === "ifrs"
    ? `${name} reports under IFRS on a 20-F. Filing history for foreign filers isn't available yet.`
    : `The SEC doesn't have a full year of reported figures for ${name} under its current registration yet, so there's no financial history to show.`;
}

export class NoFinancialsError extends Error {
  constructor(
    message: string,
    readonly reason: NoFinancialsReason,
  ) {
    super(message);
  }
}

// —— Filling capex gaps from the filings themselves ——
// Only runs when companyfacts actually left a hole: a fiscal year that has
// operating cash flow but no capital expenditure, which means free cash flow is
// missing too. Costs one Finnhub request for affected companies and none at all
// for the rest, and the result is persisted, so it happens once per company
// until its next filing.
async function fillCapexGaps(symbol: string, rows: FinancialRow[]): Promise<FinancialRow[]> {
  if (yearsMissingCapex(rows).length === 0) return rows;

  const filings = await fetchFinancialsReported(symbol, "annual");
  if (!filings?.length) return rows;

  const merged = mergeCapexFromFilings(rows, indexAnnualFilings(filings));
  const filled = (merged.length - rows.length) / 2;
  if (filled > 0) console.log(`[sec] ${symbol}: filled ${filled} capex gaps from the filings via Finnhub`);
  return merged;
}

export async function getCompanyFinancials(symbolRaw: string): Promise<CompanyFinancials | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  const ref = await lookupCik(symbol);
  // No CIK means no SEC filer under that symbol — an ETF, an index, a crypto
  // pair, or a foreign listing. Not an error: those pages still work, just with
  // a price chart and the conversation and none of the SEC tabs.
  if (!ref) return null;

  const submissions = await getSubmissions(ref.cik);
  const filerKind = filerKindFromSic(submissions?.sic);
  const newest = submissions ? latestFiling(submissions, ["10-K", "10-Q"]) : null;
  const exchange = exchangeOf(submissions, symbol);
  const latestAnnual = submissions ? latestFiling(submissions, ANNUAL_FORMS) : null;

  const stored = await getStoredCompany(ref.cik);
  const upToDate = Boolean(stored && newest && stored.latestAccession === accessionStamp(newest.accession));

  if (stored && upToDate) {
    const rows = await getStoredFinancials(ref.cik);
    if (rows.length > 0) {
      return {
        cik: ref.cik,
        symbol: stored.symbol,
        name: stored.name,
        sic: stored.sic,
        sicDescription: stored.sicDescription,
        fiscalYearEnd: stored.fiscalYearEnd,
        filerKind: stored.filerType,
        suppression: suppressedItems(stored.filerType),
        rows,
        source: "store",
        exchange,
        latestAnnual,
      };
    }
  }

  // Either we have never seen this company, or it has filed since we last
  // looked. Download the facts once and normalise.
  let facts;
  try {
    facts = await fetchCompanyFacts(ref.cik);
  } catch (err) {
    if (err instanceof NoSecDataError) return null;
    // A transient SEC failure should not lose whatever is already stored.
    const fallback = await getStoredFinancials(ref.cik);
    if (fallback.length > 0 && stored) {
      return {
        cik: ref.cik,
        symbol: stored.symbol,
        name: stored.name,
        sic: stored.sic,
        sicDescription: stored.sicDescription,
        fiscalYearEnd: stored.fiscalYearEnd,
        filerKind: stored.filerType,
        suppression: suppressedItems(stored.filerType),
        rows: fallback,
        source: "store",
        exchange,
        latestAnnual,
      };
    }
    throw err;
  }

  const { rows: secRows, suppression } = normalizeCompanyFacts(facts, { sic: submissions?.sic });
  // Banks and insurers have capex suppressed on purpose; do not go looking for
  // a figure we have decided not to show.
  const rows = suppression?.items.includes("capex") ? secRows : await fillCapexGaps(ref.symbol, secRows);

  if (rows.length === 0) {
    // Say why there's nothing, rather than showing an empty table.
    const reason: NoFinancialsReason = isIfrsFiler(facts) ? "ifrs" : "no-annual";
    throw new NoFinancialsError(noFinancialsMessage(reason, submissions?.name ?? ref.name), reason);
  }

  await upsertCompany({
    cik: ref.cik,
    symbol: ref.symbol,
    name: submissions?.name ?? ref.name,
    sic: submissions?.sic ?? null,
    sicDescription: submissions?.sicDescription ?? null,
    fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
    filerType: filerKind,
    latestAccession: newest ? accessionStamp(newest.accession) : null,
  });
  await saveFinancials(ref.cik, rows);

  return {
    cik: ref.cik,
    symbol: ref.symbol,
    name: submissions?.name ?? ref.name,
    sic: submissions?.sic ?? null,
    sicDescription: submissions?.sicDescription ?? null,
    fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
    filerKind,
    suppression,
    rows,
    source: "sec",
    exchange,
    latestAnnual,
  };
}

export { normalizeCompanyFacts, pick } from "@/lib/sec/normalize";
export type { FinancialRow, FiscalPeriod } from "@/lib/sec/normalize";
export type { LineItem, FilerKind } from "@/lib/sec/concepts";
