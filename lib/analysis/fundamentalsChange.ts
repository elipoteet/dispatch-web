// Time Machine "How the business changed" — pure math over Finnhub's
// as-reported quarterly filings. Deliberately narrow: this is NOT the full
// historical fundamentals scorecard (stock/metric only ever returns today's
// numbers, which is why that's hidden for past dates elsewhere). This just
// diffs two headline income-statement figures between the filing on record
// as of a past date and the latest filing available today.
//
// We're comparing one company to itself across time, not matching a line
// item across arbitrary tickers — a company tends to tag its own revenue and
// net income consistently quarter to quarter, so a small concept allow-list
// is reliable here in a way it wouldn't be across issuers.

export type FinancialsLineItem = {
  concept: string;
  label?: string;
  value: number;
  unit?: string;
};

export type FinancialsReportedFiling = {
  filedDate: string;
  endDate: string;
  form?: string;
  report: {
    ic?: FinancialsLineItem[];
    bs?: FinancialsLineItem[];
    cf?: FinancialsLineItem[];
  };
};

export type FigureChange = {
  label: string;
  thenValue: number;
  thenDate: string;
  nowValue: number;
  nowDate: string;
  percentChange: number | null;
};

export type FundamentalsChangeResult = { figures: FigureChange[] };

const REVENUE_CONCEPTS = [
  "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap_Revenues",
  "us-gaap_SalesRevenueNet",
];
const NET_INCOME_CONCEPTS = ["us-gaap_NetIncomeLoss"];

const FIGURE_SPECS: { label: string; concepts: string[] }[] = [
  { label: "Revenue", concepts: REVENUE_CONCEPTS },
  { label: "Net Income", concepts: NET_INCOME_CONCEPTS },
];

function truncDate(s: string): string {
  return s.slice(0, 10);
}

// The latest filing whose filedDate is on or before asOfDate — i.e. the
// filing that would actually have been public knowledge on that date.
export function pickFilingAsOf(
  filings: FinancialsReportedFiling[],
  asOfDate: string,
): FinancialsReportedFiling | null {
  const eligible = filings.filter((f) => truncDate(f.filedDate) <= asOfDate);
  if (!eligible.length) return null;
  return eligible.reduce((latest, f) => (truncDate(f.filedDate) > truncDate(latest.filedDate) ? f : latest));
}

export function pickLatestFiling(filings: FinancialsReportedFiling[]): FinancialsReportedFiling | null {
  if (!filings.length) return null;
  return filings.reduce((latest, f) => (truncDate(f.filedDate) > truncDate(latest.filedDate) ? f : latest));
}

// Never guess: only a listed concept tag, present with a numeric value,
// counts as a match. Anything else means "not found" rather than a wrong
// number.
function extractFigure(filing: FinancialsReportedFiling, concepts: string[]): number | null {
  const items = filing.report?.ic;
  if (!Array.isArray(items)) return null;
  for (const concept of concepts) {
    const match = items.find((item) => item.concept === concept);
    if (match && typeof match.value === "number" && !isNaN(match.value)) return match.value;
  }
  return null;
}

// A percent change against a zero or negative base (a net loss "then") isn't
// a meaningful percentage — e.g. a loss narrowing from -$10M to -$5M is
// improvement, but (then-now)/then math reads as a nonsensical negative
// swing. Omit the percentage rather than show something misleading; the raw
// dollar figures are still shown either way.
export function computePercentChange(then: number, now: number): number | null {
  if (then <= 0) return null;
  return ((now - then) / then) * 100;
}

export function buildFundamentalsChange(
  filings: FinancialsReportedFiling[],
  asOfDate: string,
): FundamentalsChangeResult | null {
  const thenFiling = pickFilingAsOf(filings, asOfDate);
  const nowFiling = pickLatestFiling(filings);
  if (!thenFiling || !nowFiling) return null;

  const figures: FigureChange[] = [];
  for (const spec of FIGURE_SPECS) {
    const thenValue = extractFigure(thenFiling, spec.concepts);
    const nowValue = extractFigure(nowFiling, spec.concepts);
    if (thenValue == null || nowValue == null) continue;
    figures.push({
      label: spec.label,
      thenValue,
      thenDate: truncDate(thenFiling.endDate),
      nowValue,
      nowDate: truncDate(nowFiling.endDate),
      percentChange: computePercentChange(thenValue, nowValue),
    });
  }

  if (!figures.length) return null;
  return { figures };
}
