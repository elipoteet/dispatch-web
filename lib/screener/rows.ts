// What the screener job writes, worked out from what it read. Pure, so every
// rule here is unit-tested without the network or the database.

import type { FilerProfile } from "@/lib/sec/client";
import type { FilerKind } from "@/lib/sec/concepts";
import type { Assembled, CompanyYear, Picked } from "@/lib/screener/assemble";
import type { CustomerMoney } from "@/lib/screener/customerMoney";
import { METRICS, cashAndInvestments, debtLacksCurrentPart, type MetricContext, type ScreenerMetrics, type StatementLine } from "@/lib/screener/metrics";
import { displayName } from "@/lib/screener/names";
import { sectorFor } from "@/lib/screener/sectorCorrections";

// —— Net income from the 10-K, where the frames hold the proxy's ——
// A frame keeps each company's last-filed figure, and for net income that is
// often the proxy statement's restatement (Tesla's 2025: $3.855 billion in its
// proxy, $3.794 billion in its 10-K). The tell: the year's net income came
// from a different filing than its operating cash flow (or revenue), which the
// proxy never restates. Those years, and years the units rules left n/a, get
// the 10-K's own figure from the company's concept file (client.ts,
// fetchCompanyConcept; assemble.ts, annualReportFact).
//
// Revenue gets the same treatment (7 November 2026). A frame keeps a
// company's last-filed revenue too, and JAKKS Pacific's first-quarter 2026
// report tagged its first quarter of 2025 ($113.3 million) as the whole of
// 2025; the frames hold that, its 10-K says $570.7 million. The tell is the
// same: revenue from a different filing than the year's operating cash flow
// (or net income).
export type FixedItem = "net_income" | "revenue";

// The filing the rest of the year's figures came from: its 10-K, normally.
function homeFiling(year: CompanyYear, item: FixedItem): string | null {
  const other: FixedItem = item === "net_income" ? "revenue" : "net_income";
  return year.values.operating_cash_flow?.accn ?? year.values[other]?.accn ?? null;
}

export function needsAnnualReportFix(year: CompanyYear | null, item: FixedItem = "net_income"): boolean {
  if (!year) return false;
  // The 10-K's own figure is the one in the wrong units: nothing to fetch.
  if (year.dollarsInOtherUnits) return false;
  const value = year.values[item];
  if (!value) return year.inconsistent.includes(item);
  const home = homeFiling(year, item);
  return home != null && value.accn !== home;
}

// The 10-K's figure for one year, and the frames filing it replaced, so the
// next night can reuse it while the frames still hold that same filing. val
// is null when the company's 10-Ks have no figure under that tag (Caterpillar
// files its 10-K net income under another one); the frames value then stands,
// and remembering the answer saves asking again every night. rule 2 marks a
// figure taken 10-K first (annualReportFact, 7 November 2026).
export type AnnualFix = { frames: string | null; end: string; val: number | null; accn: string | null; rule?: number };
export type NetIncomeFix = AnnualFix;
export const FIX_RULE = 2;

function fixYear(year: CompanyYear, fix: AnnualFix | undefined, tag: string, item: FixedItem): CompanyYear {
  if (!fix || fix.end !== year.periodEnd || fix.val == null || fix.accn == null) return year;
  const picked: Picked = { val: fix.val, end: fix.end, tag, accn: fix.accn };
  return { ...year, values: { ...year.values, [item]: picked }, inconsistent: year.inconsistent.filter((i) => i !== item) };
}

export function applyAnnualReportFix(a: Assembled, item: FixedItem, tag: string, latest?: AnnualFix, prior?: AnnualFix): Assembled {
  const fixed: Assembled = { ...a, latest: fixYear(a.latest, latest, tag, item), prior: a.prior ? fixYear(a.prior, prior, tag, item) : null };
  if (item !== "revenue") return fixed;
  // Revenue history starts with the latest year and the one before it, so a
  // fixed figure replaces those two entries too (growth over 3, 5 and 10
  // years, and "years in a row", read the history).
  const history = [...a.revenueHistory];
  const inconsistent = new Set(a.revenueHistoryInconsistent);
  [fixed.latest, fixed.prior].forEach((year, i) => {
    const r = year?.values.revenue;
    if (year && r && r.accn !== a.revenueHistory[i]?.accn && history.length > i) {
      history[i] = r;
      inconsistent.delete(i);
    }
  });
  return { ...fixed, revenueHistory: history, revenueHistoryInconsistent: [...inconsistent].sort((x, y) => x - y) };
}

export function applyNetIncomeFix(a: Assembled, tag: string, latest?: NetIncomeFix, prior?: NetIncomeFix): Assembled {
  return applyAnnualReportFix(a, "net_income", tag, latest, prior);
}

// Whether last night's fix still applies: same year, and the frames still hold
// the filing it replaced. A fix from before the 10-K-first rule is kept only
// if it came from the year's own filing; otherwise it's fetched again.
export function reusableFix(previous: AnnualFix | undefined, year: CompanyYear | null, item: FixedItem = "net_income"): AnnualFix | undefined {
  if (!previous || !year) return undefined;
  if (previous.end !== year.periodEnd) return undefined;
  const framesNow = year.values[item]?.accn ?? null;
  if (previous.frames !== framesNow) return undefined;
  if ((previous.rule ?? 1) < FIX_RULE && previous.val != null && previous.accn !== homeFiling(year, item)) return undefined;
  return previous;
}

// —— Interest expense for ROIC without an operating income line ——
// Return on invested capital falls back to pretax income plus interest
// expense where no operating income is filed (metrics.ts). Most large
// companies now file interest as InterestExpenseNonoperating, and the SEC's
// frames for that tag leave out 10-Ks filed before about mid-2026 (concepts.ts,
// interest_expense), so Johnson & Johnson's and Eli Lilly's interest isn't in
// them though their own concept files have it. For a company with pretax
// income, no operating income and no interest in the frames, the job takes the
// year's figure from its concept file (annualReportFact), once per annual
// report; a company with no such figure stays n/a.
export const INTEREST_TAG = "InterestExpenseNonoperating";

export type InterestFix = { end: string; home: string | null; val: number | null; accn: string | null };

export function needsInterestFix(a: Assembled, kind: FilerKind): boolean {
  const L = a.latest.values;
  return kind === "operating" && !L.operating_income && L.pretax_income != null && !L.interest_expense && a.latest.periodStart != null;
}

export function reusableInterestFix(previous: InterestFix | undefined, a: Assembled): InterestFix | undefined {
  if (!previous || previous.end !== a.latest.periodEnd || previous.home !== statementFiling(a)) return undefined;
  return previous;
}

export function applyInterestFix(a: Assembled, fix: InterestFix | undefined): Assembled {
  if (!fix || fix.val == null || fix.accn == null || fix.end !== a.latest.periodEnd || a.latest.values.interest_expense) return a;
  const picked: Picked = { val: fix.val, end: fix.end, tag: INTEREST_TAG, accn: fix.accn };
  return { ...a, latest: { ...a.latest, values: { ...a.latest.values, interest_expense: picked } } };
}

// —— Securities under a company's own label (lib/sec/statementPage.ts) ——
// Where the securities a company reports in the standard tag (available-for-
// sale debt securities, less any long-term part) come to more than a tenth of
// the cash counted and at least $100 million, while no short-term investment
// line was counted, they sit on the balance sheet under the company's own
// element. The job then reads the balance sheet page of the year's annual
// report (statementFiling) and adds what it finds, once per filing: the read
// carries over until the year's filing changes. 35 companies on 9 November
// 2026, NVIDIA, KLA and eBay among them; for most (Caterpillar's insurance
// holdings, Duke Energy's decommissioning fund) the page shows nothing more
// among current assets, and their cash stands.
// Rule 2 (9 November 2026): debt due within a year read too.
export const STATEMENT_RULE = 2;
export const UNPLACED_SECURITIES_SHARE = 0.1;
export const UNPLACED_SECURITIES_FLOOR = 100_000_000;

export type StatementRead = {
  accn: string;
  file: string | null;
  added: StatementLine[];
  // Debt lines among current liabilities, when the debt check was asked for
  // (needsDebtRead).
  shortTermDebt?: StatementLine[] | null;
  // Why nothing could be taken from the page; net cash is then n/a.
  failed: string | null;
  rule: number;
};

export function needsStatementRead(a: Assembled, kind: FilerKind): boolean {
  return needsSecuritiesRead(a, kind) || needsDebtRead(a, kind);
}

// The same page, for debt due within a year a company files only under its
// own element or split by business (Caterpillar): metrics.ts,
// debtLacksCurrentPart.
export function needsDebtRead(a: Assembled, kind: FilerKind): boolean {
  return kind === "operating" && cashAndInvestments(a.balance) != null && debtLacksCurrentPart(a.balance);
}

export function needsSecuritiesRead(a: Assembled, kind: FilerKind): boolean {
  if (kind !== "operating") return false;
  const B = a.balance;
  if (B.cash_and_short_term_investments || B.short_term_investments) return false;
  const cash = cashAndInvestments(B);
  const total = B.securities_total?.val;
  if (!cash || total == null) return false;
  const unplaced = total - (B.securities_noncurrent?.val ?? 0);
  return unplaced > Math.max(Math.abs(cash.value) * UNPLACED_SECURITIES_SHARE, UNPLACED_SECURITIES_FLOOR);
}

// The annual report the latest year's figures came from.
export function statementFiling(a: Assembled): string | null {
  const L = a.latest.values;
  return L.operating_cash_flow?.accn ?? L.revenue?.accn ?? L.net_income?.accn ?? null;
}

export function reusableStatementRead(previous: StatementRead | undefined, accn: string | null): StatementRead | undefined {
  if (!previous || !accn || previous.accn !== accn || previous.rule !== STATEMENT_RULE) return undefined;
  return previous;
}

// What the measures get: nothing when no read was needed; "unread" when one
// was and isn't there, or failed, so net cash is n/a rather than short.
export function statementContext(read: StatementRead | undefined, needed: boolean): MetricContext["statement"] {
  if (!needed) return undefined;
  if (!read || read.failed) return "unread";
  return { added: read.added, shortTermDebt: read.shortTermDebt ?? null };
}

// —— Rows ——
export type ProfileRow = {
  cik: string;
  name: string | null;
  sic: string | null;
  sic_description: string | null;
  state: string | null;
  fiscal_year_end: string | null;
  entity_type: string | null;
  fetched_at: string;
};

export function profileRow(p: FilerProfile, fetchedAt: string): ProfileRow {
  return {
    cik: p.cik,
    name: p.name ?? null,
    sic: p.sic,
    sic_description: p.sicDescription,
    state: p.state,
    fiscal_year_end: p.fiscalYearEnd,
    entity_type: p.entityType,
    fetched_at: fetchedAt,
  };
}

// —— Who's left out: commodity and crypto funds ——
// Gold, oil, currency and bitcoin trusts and ETFs file annual reports, so the
// frames carry them, but they hold a commodity rather than run a business
// (Eli, 7 November 2026). The SEC files them under commodity dealers (6221)
// or other financial services (6199); the name settles it, because three
// businesses share 6221 (Uranium Royalty, Antalpha Platform, AI Financial).
// 68 funds on 7 November 2026. Lending funds (Blackstone Secured Lending)
// have other codes and stay: they lend to businesses.
const FUND_SICS = new Set(["6221", "6199"]);
const FUND_NAME = /\b(ETF|ETN|ETP|Fund|Trust)\b/i;

export function isCommodityOrCryptoFund(sic: string | null | undefined, name: string): boolean {
  return sic != null && FUND_SICS.has(sic) && FUND_NAME.test(name);
}

export type ScreenerRowInput = {
  company: Assembled;
  ticker: string;
  exchange: string | null;
  profile: ProfileRow;
  kind: FilerKind;
  metrics: ScreenerMetrics;
  fixes: { latest?: AnnualFix; prior?: AnnualFix };
  revenueFixes?: { latest?: AnnualFix; prior?: AnnualFix };
  customerMoney?: CustomerMoney;
  statement?: StatementRead;
  interestFix?: InterestFix;
  updatedAt: string;
};

export function screenerRow(input: ScreenerRowInput): Record<string, unknown> {
  const { company: a, profile, metrics: m } = input;
  const cik = String(a.cik).padStart(10, "0");
  const sources: Record<string, unknown> = {};
  for (const [item, p] of Object.entries({ ...a.latest.values, ...a.balance })) {
    if (p) sources[item] = [p.tag, p.accn];
  }
  if (input.fixes.latest || input.fixes.prior) sources.net_income_10k = { latest: input.fixes.latest ?? null, prior: input.fixes.prior ?? null };
  const rf = input.revenueFixes;
  if (rf && (rf.latest || rf.prior)) sources.revenue_10k = { latest: rf.latest ?? null, prior: rf.prior ?? null };
  // How net cash and ROIC were put together, for tracing a figure.
  const w = m.workings;
  if (w.cash || w.debt) sources.net_cash = { cash: w.cash, debt: w.debt };
  if (w.taxRate) sources.roic_tax_rate = w.taxRate;
  if (w.roicBasis) sources.roic_basis = w.roicBasis;
  if (input.customerMoney?.holds) sources.customer_money = input.customerMoney.how;
  if (input.statement) sources.cash_from_statement = input.statement;
  if (input.interestFix) sources.interest_10k = input.interestFix;
  if (a.latest.dollarsInOtherUnits) sources.dollars_in_other_units = a.latest.dollarsInOtherUnits;
  const row: Record<string, unknown> = {
    cik,
    ticker: input.ticker,
    exchange: input.exchange,
    name: displayName(cik, a.name, profile.name),
    sector: sectorFor(cik, profile.sic),
    sic: profile.sic,
    filer_kind: input.kind,
    state: profile.state,
    period_start: a.latest.periodStart,
    period_end: a.latest.periodEnd,
    fiscal_year_end: profile.fiscal_year_end,
    revenue: m.values.revenue,
    net_income: m.netIncome,
    free_cash_flow: m.freeCashFlow,
    pays_dividend: m.paysDividend,
    na_reasons: m.na,
    sources,
    updated_at: input.updatedAt,
  };
  for (const key of METRICS) if (key !== "revenue") row[key] = m.values[key];
  return row;
}

// —— Where the middle company sits ——
// For each measure, the median across every company the run publishes that
// has a value for it (n/a left out), so the filter panel can say "Half of
// companies: above 38%". For "pays a dividend", the share of every company
// that does: a company with no dividend line paid none it reported, and
// counting only those with a line said 95%.
export type Median = { metric: string; median: number; companies: number };

export function medians(rows: Record<string, unknown>[], keys: readonly string[]): Median[] {
  const out: Median[] = [];
  for (const key of keys) {
    const values = rows.map((r) => r[key]).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    if (!values.length) continue;
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    out.push({ metric: key, median, companies: values.length });
  }
  if (rows.length) {
    const paying = rows.filter((r) => r.pays_dividend === true).length;
    out.push({ metric: "pays_dividend", median: paying / rows.length, companies: rows.length });
  }
  return out;
}

// —— Publishing ——
// A run writes every row into screener_metrics_next and then swaps the whole
// set in at once (migration 0027, screener_publish), so the screener shows
// either last night's complete set or tonight's, never a mixture, and
// companies that left the list (delisted, past 18 months without an annual
// report, out of the SEC's ticker file) drop out with the swap.
//
// It publishes only after a run that read every frames file and staged at
// least nine in ten of the rows showing now, so an SEC outage or a
// half-finished run never empties the screener. The database checks the
// staged count again (minPublishRows) before swapping.
export function minPublishRows(showingNow: number): number {
  return Math.max(1, Math.ceil(showingNow * 0.9));
}

export function publishDecision(run: { framesComplete: boolean; staged: number; showingNow: number }): { publish: boolean; reason: string | null } {
  if (!run.framesComplete) return { publish: false, reason: "some frames files failed to download" };
  if (run.staged < minPublishRows(run.showingNow)) {
    return { publish: false, reason: `only ${run.staged} rows staged against ${run.showingNow} showing` };
  }
  return { publish: true, reason: null };
}
