// The one function the rest of the site calls. Server-only.
//
// getCompanyFinancials("NVDA") -> ten years of clean, comparable figures,
// whatever it takes to get them: a cache hit, a database read, or a full fetch
// and normalise on first sight of a company.
//
// Stage 1 has no UI. This is the seam the Financials, Valuation and Earnings
// tabs will all sit on in later stages.

import { fetchCompanyFacts, getSubmissions, latestFiling, lookupCik, NoSecDataError } from "@/lib/sec/client";
import { normalizeCompanyFacts, type FinancialRow } from "@/lib/sec/normalize";
import { filerKindFromSic, suppressedItems, type FilerKind, type LineItem } from "@/lib/sec/concepts";
import { getStoredCompany, getStoredFinancials, saveFinancials, upsertCompany } from "@/lib/sec/store";

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
};

// Foreign private issuers file 20-F on the IFRS taxonomy; the us-gaap tag lists
// in concepts.ts do not apply to them and would silently return almost nothing.
// Out of scope for v1, per the brief — detected and stated, never half-rendered.
function isForeignFiler(rows: FinancialRow[], hasFacts: boolean): boolean {
  return hasFacts && rows.length === 0;
}

export class NoFinancialsError extends Error {}

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

  const stored = await getStoredCompany(ref.cik);
  const upToDate = Boolean(stored && newest && stored.latestAccession === newest.accession);

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
      };
    }
    throw err;
  }

  const { rows, suppression } = normalizeCompanyFacts(facts, { sic: submissions?.sic });

  if (isForeignFiler(rows, true)) {
    // A company with facts but nothing our tag lists recognise is almost always
    // an IFRS filer. Say so rather than showing an empty table.
    throw new NoFinancialsError(
      `${ref.name} reports under IFRS on a 20-F. Filing history for foreign filers isn't available yet.`,
    );
  }

  await upsertCompany({
    cik: ref.cik,
    symbol: ref.symbol,
    name: submissions?.name ?? ref.name,
    sic: submissions?.sic ?? null,
    sicDescription: submissions?.sicDescription ?? null,
    fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
    filerType: filerKind,
    latestAccession: newest?.accession ?? null,
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
  };
}

export { normalizeCompanyFacts, pick } from "@/lib/sec/normalize";
export type { FinancialRow, FiscalPeriod } from "@/lib/sec/normalize";
export type { LineItem, FilerKind } from "@/lib/sec/concepts";
