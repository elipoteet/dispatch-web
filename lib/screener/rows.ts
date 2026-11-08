// What the screener job writes, worked out from what it read. Pure, so every
// rule here is unit-tested without the network or the database.

import type { FilerProfile } from "@/lib/sec/client";
import type { FilerKind } from "@/lib/sec/concepts";
import type { Assembled, CompanyYear, Picked } from "@/lib/screener/assemble";
import { METRICS, type ScreenerMetrics } from "@/lib/screener/metrics";
import { displayName } from "@/lib/screener/names";
import { sectorFromSic } from "@/lib/screener/sectors";

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
  const row: Record<string, unknown> = {
    cik,
    ticker: input.ticker,
    exchange: input.exchange,
    name: displayName(cik, a.name, profile.name),
    sector: sectorFromSic(profile.sic),
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
