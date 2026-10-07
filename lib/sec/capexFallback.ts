// Recovering capital expenditure when the SEC's companyfacts API does not carry it.
//
// Why this is needed at all: companyfacts serves only the standard taxonomies.
// A company that tags a line with its own extension concept is invisible to it.
// NVIDIA is the worked example — it reports capital expenditure as
// `nvda_PurchasesOfPropertyAndEquipmentAndIntangibleAssets`, so fiscal 2013
// through 2021 have no capex in companyfacts and therefore no free cash flow,
// even though the figure is right there in the cash-flow statement of every one
// of those 10-Ks.
//
// Finnhub's as-reported endpoint carries the filing's own line items, extension
// concepts included, so it can fill the gap. But it is a second source, and the
// rule for this phase is "a blank is fine; a wrong number is not" — so the match
// has to be confident or it does not happen.
//
// Confidence here means exactly one line in the cash-flow statement looks like
// capital expenditure. If two do, or none do, we return nothing rather than pick.
// That matters: NVIDIA's fiscal 2021 statement carries both "Purchases related to
// property and equipment and intangible assets" ($1,128M, the real one) and
// "Principal payments on property and equipment" ($17M, a financing repayment).
// Matching loosely would silently swap a capex figure for a debt repayment.

import type { FinancialsReportedFiling, FinancialsReportedLineItem } from "@/lib/providers";
import type { FinancialRow } from "@/lib/sec/normalize";

// Must look like money going out to buy long-lived assets.
const LOOKS_LIKE_SPEND = /\b(purchas|acquisit|acquire|additions?|expenditure|investment)/i;
const LOOKS_LIKE_ASSET = /\b(propert|equipment|plant|capital expenditure|fixed asset|capex)/i;

// Lines that mention the same words but are something else entirely.
const NOT_CAPEX = [
  /principal payment/i, // financing repayment on financed equipment
  /proceeds/i, // money coming in
  /\bsale[s]?\b|dispos|divest/i, // selling assets, not buying
  /maturit/i,
  /lease liabilit|operating lease|finance lease/i,
  /business|acquisition of business|net of cash acquired/i, // buying companies, not kit
  /depreciat|amortiz/i, // non-cash
  /held for sale/i,
];

export type CapexMatch = {
  value: number;
  label: string;
  concept: string;
  endDate: string;
  filedDate: string;
};

function isCapexLine(item: FinancialsReportedLineItem): boolean {
  const text = `${item.label ?? ""} ${item.concept ?? ""}`;
  if (!LOOKS_LIKE_SPEND.test(text)) return false;
  if (!LOOKS_LIKE_ASSET.test(text)) return false;
  return !NOT_CAPEX.some((pattern) => pattern.test(text));
}

// One filing in, at most one capex figure out.
export function findCapexInFiling(filing: FinancialsReportedFiling): CapexMatch | null {
  const cashFlow = filing.report?.cf;
  if (!Array.isArray(cashFlow)) return null;

  const matches = cashFlow.filter((item) => isCapexLine(item) && Number.isFinite(item.value) && item.value !== 0);
  // Ambiguity is a reason to stop, not to choose.
  if (matches.length !== 1) return null;

  const match = matches[0];
  return {
    // Filings differ on sign for an outflow; the magnitude is the figure, and
    // capex is positive everywhere else in this codebase (SEC's own
    // PaymentsToAcquire* concepts are positive too), so free cash flow stays
    // operating cash flow minus capex either way.
    value: Math.abs(match.value),
    label: match.label ?? "",
    concept: match.concept ?? "",
    endDate: String(filing.endDate).slice(0, 10),
    filedDate: String(filing.filedDate).slice(0, 10),
  };
}

// Index the annual filings by the date their period ended, which is how a fiscal
// year is matched to one. Deliberately an exact date match rather than a
// year-ish comparison: a 52/53-week filer's year-end moves by several days, and
// guessing which filing belongs to which year is exactly the kind of near-miss
// that produces a confident wrong number.
export function indexAnnualFilings(filings: FinancialsReportedFiling[]): Map<string, CapexMatch> {
  const byEnd = new Map<string, CapexMatch>();
  for (const filing of filings) {
    if (filing.form && !/^10-K/.test(filing.form)) continue;
    const match = findCapexInFiling(filing);
    if (!match) continue;
    const existing = byEnd.get(match.endDate);
    // Prefer the original filing over a later one restating the same year, to
    // match the SEC path's own "earliest filing wins" rule.
    if (!existing || match.filedDate < existing.filedDate) byEnd.set(match.endDate, match);
  }
  return byEnd;
}

// Which fiscal years have operating cash flow but no capital expenditure, and so
// no free cash flow either. Separated out so the decision to call Finnhub at all
// is cheap and obvious: no gaps, no request.
export function yearsMissingCapex(rows: FinancialRow[]): FinancialRow[] {
  const haveCapex = new Set(
    rows.filter((r) => r.lineItem === "capex" && r.fiscalPeriod === "FY").map((r) => r.fiscalYear),
  );
  return rows.filter(
    (r) => r.lineItem === "operating_cash_flow" && r.fiscalPeriod === "FY" && !haveCapex.has(r.fiscalYear),
  );
}

// Pure merge: the SEC rows plus whatever the filings could fill in. Kept free of
// I/O so the whole path is testable against saved responses.
export function mergeCapexFromFilings(rows: FinancialRow[], byEnd: Map<string, CapexMatch>): FinancialRow[] {
  const added: FinancialRow[] = [];

  for (const cash of yearsMissingCapex(rows)) {
    // Matched on the exact period end, never on the year alone — see
    // indexAnnualFilings for why.
    const match = byEnd.get(cash.periodEnd);
    if (!match) continue;

    const capex: FinancialRow = {
      fiscalYear: cash.fiscalYear,
      fiscalPeriod: "FY",
      periodEnd: cash.periodEnd,
      lineItem: "capex",
      value: match.value,
      unit: "USD",
      // The filing's own concept, which is the whole point — it is usually a
      // company extension tag, which is why companyfacts had nothing.
      sourceTag: match.concept || match.label,
      accession: "",
      filedAt: match.filedDate,
      restated: false,
      derived: false,
      source: "finnhub",
    };
    added.push(capex);
    added.push({
      ...capex,
      lineItem: "free_cash_flow",
      value: cash.value - match.value,
      sourceTag: `${cash.sourceTag} - ${capex.sourceTag}`,
      derived: true,
    });
  }

  return added.length > 0 ? [...rows, ...added] : rows;
}
