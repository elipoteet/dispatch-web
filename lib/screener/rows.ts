// What the screener job writes, worked out from what it read. Pure, so every
// rule here is unit-tested without the network or the database.

import type { FilerProfile } from "@/lib/sec/client";
import type { FilerKind } from "@/lib/sec/concepts";
import type { Assembled, CompanyYear, Picked } from "@/lib/screener/assemble";
import { METRICS, type ScreenerMetrics } from "@/lib/screener/metrics";
import { sectorFromSic } from "@/lib/screener/sectors";

// —— Net income from the 10-K, where the frames hold the proxy's ——
// A frame keeps each company's last-filed figure, and for net income that is
// often the proxy statement's restatement (Tesla's 2025: $3.855 billion in its
// proxy, $3.794 billion in its 10-K). The tell: the year's net income came
// from a different filing than its operating cash flow (or revenue), which the
// proxy never restates. Those years, and years the units rules left n/a, get
// the 10-K's own figure from the company's concept file (client.ts,
// fetchCompanyConcept; assemble.ts, annualReportFact).
export function needsAnnualReportFix(year: CompanyYear | null): boolean {
  if (!year) return false;
  const income = year.values.net_income;
  if (!income) return year.inconsistent.includes("net_income");
  const home = year.values.operating_cash_flow?.accn ?? year.values.revenue?.accn;
  return home != null && income.accn !== home;
}

// The 10-K's figure for one year, and the frames filing it replaced, so the
// next night can reuse it while the frames still hold that same filing.
export type NetIncomeFix = { frames: string | null; end: string; val: number; accn: string };

function fixYear(year: CompanyYear, fix: NetIncomeFix | undefined, tag: string): CompanyYear {
  if (!fix || fix.end !== year.periodEnd) return year;
  const picked: Picked = { val: fix.val, end: fix.end, tag, accn: fix.accn };
  return { ...year, values: { ...year.values, net_income: picked }, inconsistent: year.inconsistent.filter((i) => i !== "net_income") };
}

export function applyNetIncomeFix(a: Assembled, tag: string, latest?: NetIncomeFix, prior?: NetIncomeFix): Assembled {
  return { ...a, latest: fixYear(a.latest, latest, tag), prior: a.prior ? fixYear(a.prior, prior, tag) : null };
}

// Whether last night's fix still applies: same year, and the frames still hold
// the filing it replaced.
export function reusableFix(previous: NetIncomeFix | undefined, year: CompanyYear | null): NetIncomeFix | undefined {
  if (!previous || !year) return undefined;
  if (previous.end !== year.periodEnd) return undefined;
  const framesNow = year.values.net_income?.accn ?? null;
  return previous.frames === framesNow ? previous : undefined;
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

export type ScreenerRowInput = {
  company: Assembled;
  ticker: string;
  exchange: string | null;
  profile: ProfileRow;
  kind: FilerKind;
  metrics: ScreenerMetrics;
  fixes: { latest?: NetIncomeFix; prior?: NetIncomeFix };
  updatedAt: string;
};

export function screenerRow(input: ScreenerRowInput): Record<string, unknown> {
  const { company: a, profile, metrics: m } = input;
  const sources: Record<string, unknown> = {};
  for (const [item, p] of Object.entries({ ...a.latest.values, ...a.balance })) {
    if (p) sources[item] = [p.tag, p.accn];
  }
  if (input.fixes.latest || input.fixes.prior) sources.net_income_10k = { latest: input.fixes.latest ?? null, prior: input.fixes.prior ?? null };
  const row: Record<string, unknown> = {
    cik: String(a.cik).padStart(10, "0"),
    ticker: input.ticker,
    exchange: input.exchange,
    name: a.name,
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
