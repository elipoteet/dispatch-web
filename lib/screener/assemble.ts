// Frames -> each company's latest year, the year before, and its revenue
// history. Pure, so every rule is tested against saved real frames.
//
// The rules mirror the normaliser (lib/sec/normalize.ts) wherever frames allow,
// so a number in the screener is the number on the company's research file:
//
// - A year is 340 to 380 days (52- and 53-week years included).
// - Within a line item, a company's tags are ranked by how many years they
//   cover, list order breaking ties (normalize.ts, rankTags: the Walmart fix,
//   where two revenue tags in one column disagreed). Each year then takes the
//   best-ranked tag that has a value for it. That is not "the first tag in the
//   list", which is what the phase eleven brief said the normaliser does.
// - Cash missing its own tag is worked out from the total that includes
//   restricted cash, less the restricted cash filed for the same date
//   (normalize.ts, cashFromTotal; Chevron's 2024 and 2025 year-ends).
//
// What frames can't give: a fiscal-year label. They carry period dates only,
// and a January year-end is fiscal 2026 at NVIDIA but usually fiscal 2025 at a
// retailer; only the filer knows. So the screener states the period itself
// ("year ended 25 January 2026").

import { CONCEPT_TAGS, SCREENER_CONCEPT_TAGS } from "@/lib/sec/concepts";
import { SCREENER_INPUTS, reportCutoff, type FrameResponse, type FrameValue, type InputItem } from "@/lib/sec/frames";
import type { SecFact } from "@/lib/sec/normalize";
import { settleCashFlow, settleNetIncome, settleRevenue, type Settled } from "@/lib/sec/units";

const DAY_MS = 86_400_000;

// —— Collecting frames per company ——
export type CompanyFrames = {
  cik: number;
  name: string;
  // The name on the newest row seen, so a renamed company shows its new name.
  nameAsOf: string;
  byTag: Map<string, FrameValue[]>;
};

export type FrameCollection = Map<number, CompanyFrames>;

// Adds one frame to the per-company collection. A company's annual value sits
// in exactly one calendar-year frame and an instant in exactly one quarter
// frame, so nothing is double-counted; a repeat of the same period (only
// possible if a frame is added twice) is ignored.
export function collectFrame(into: FrameCollection, tag: string, frame: FrameResponse): void {
  for (const row of frame.data ?? []) {
    if (typeof row?.val !== "number" || !Number.isFinite(row.val) || !row.end) continue;
    let company = into.get(row.cik);
    if (!company) {
      company = { cik: row.cik, name: row.entityName, nameAsOf: row.end, byTag: new Map() };
      into.set(row.cik, company);
    } else if (row.end > company.nameAsOf) {
      company.name = row.entityName;
      company.nameAsOf = row.end;
    }
    const list = company.byTag.get(tag) ?? [];
    if (list.some((v) => v.end === row.end && v.start === (row.start ?? null))) continue;
    list.push({ val: row.val, start: row.start ?? null, end: row.end, accn: row.accn });
    company.byTag.set(tag, list);
  }
}

// —— Choosing values ——
export type Picked = {
  val: number;
  end: string;
  // The XBRL tag, or a description of the calculation for a derived value.
  tag: string;
  // The filing the number came from; for a derived value, the first input's.
  accn: string;
  derived?: boolean;
};

const SPEC = new Map(SCREENER_INPUTS.map((s) => [s.item, s]));

function isAnnual(v: FrameValue): boolean {
  if (!v.start) return false;
  const days = Math.round((Date.parse(v.end) - Date.parse(v.start)) / DAY_MS);
  return days >= 340 && days <= 380;
}

function valuesFor(company: CompanyFrames, tag: string, kind: "duration" | "instant"): FrameValue[] {
  const all = company.byTag.get(tag) ?? [];
  return kind === "duration" ? all.filter(isAnnual) : all.filter((v) => !v.start);
}

// Tags for one line item, best first, among those the company files at all.
// Durations: most years covered, then list order (normalize.ts, rankTags).
// Balance-sheet items: list order alone, because that's what the normaliser
// ends up doing for them (rankTags counts annual spans, and an instant has
// none, so every instant tag ties at zero).
export function rankedTags(company: CompanyFrames, item: InputItem): string[] {
  const spec = SPEC.get(item);
  if (!spec) return [];
  return spec.tags
    .map((tag, index) => ({ tag, index, coverage: new Set(valuesFor(company, tag, spec.kind).map((v) => v.end)).size }))
    .filter((t) => t.coverage > 0)
    .sort((a, b) => (spec.kind === "duration" ? b.coverage - a.coverage : 0) || a.index - b.index)
    .map((t) => t.tag);
}

// The value of a line item for the period ending on `end`, from the
// best-ranked tag that has one.
export function pick(company: CompanyFrames, item: InputItem, end: string, ranked = rankedTags(company, item)): Picked | null {
  const spec = SPEC.get(item);
  if (!spec) return null;
  for (const tag of ranked) {
    const hit = valuesFor(company, tag, spec.kind).find((v) => v.end === end);
    if (hit) return { val: hit.val, end: hit.end, tag, accn: hit.accn };
  }
  return null;
}

// Cash and equivalents on `end`, with the normaliser's derivation from the
// restricted-cash total ranked straight after the company's own best cash tag.
// Only for a company that files restricted cash in the standard tags at all,
// and only when every group it uses has a value on this date.
export const CASH_FROM_TOTAL_LABEL = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents - restricted cash";

function cashFromTotal(company: CompanyFrames, end: string): Picked | null {
  const total = pick(company, "cash_with_restricted", end);
  if (!total) return null;
  const groups: InputItem[] = ["restricted_cash_current", "restricted_cash_noncurrent"];
  const used = groups.filter((g) => rankedTags(company, g).length > 0);
  if (used.length === 0) return null;
  let restricted = 0;
  for (const g of used) {
    const hit = pick(company, g, end);
    if (!hit) return null;
    restricted += hit.val;
  }
  return { val: total.val - restricted, end, tag: CASH_FROM_TOTAL_LABEL, accn: total.accn, derived: true };
}

// The normaliser's order exactly: the list's own cash tag, then the
// calculation, then the restricted-inclusive total. It holds even for a
// company that never files the first tag: Chevron tags its balance-sheet cash
// with a company-specific element, so its year-end cash is the calculation
// ($7,285M total less $174M and $818M restricted = $6,293M), not the total.
function pickCash(company: CompanyFrames, end: string): Picked | null {
  const list = SPEC.get("cash_and_equivalents")?.tags ?? [];
  return (
    pick(company, "cash_and_equivalents", end, list.slice(0, 1)) ??
    cashFromTotal(company, end) ??
    pick(company, "cash_and_equivalents", end, list.slice(1))
  );
}

// —— Units errors in the filing ——
// Revenue, net income and operating cash flow go through lib/sec/units.ts,
// the same rules the research file's normaliser uses, so a figure the filing
// contradicts is settled the same way in both places (Tigo Energy's revenue:
// $103.5 million, not the $103.5 billion it also tagged), or left n/a
// ("inconsistent").
//
// One trap is the frames' own: a frame keeps each company's last-filed value,
// and the proxy statement (DEF 14A), filed weeks after the 10-K, restates net
// income in its pay-versus-performance table, sometimes rounded or in other
// units (Tesla's 2025: $3.855 billion in the proxy, $3.794 billion in the
// 10-K; FedEx's: $4,433, in millions). The nightly job replaces such a figure
// with the 10-K's own (annualReportValue, below); until then EPS x shares
// catches the units errors among them.
const SETTLED: ReadonlySet<InputItem> = new Set<InputItem>(["revenue", "net_income", "operating_cash_flow"]);

// Every tag's value for one line item and period, best-ranked first.
function candidatesFor(company: CompanyFrames, item: InputItem, end: string, ranked: string[]): Picked[] {
  const out: Picked[] = [];
  for (const tag of ranked) {
    const hit = pick(company, item, end, [tag]);
    if (hit) out.push(hit);
  }
  return out;
}

function settle(
  company: CompanyFrames,
  item: InputItem,
  end: string,
  ranked: string[],
  values: Partial<Record<DurationItem, Picked>>,
): Settled<Picked> {
  const candidates = candidatesFor(company, item, end, ranked);
  if (item === "revenue") return settleRevenue(candidates, values.gross_profit?.val ?? null, values.cost_of_revenue?.val ?? null);
  if (item === "operating_cash_flow") return settleCashFlow(candidates);
  // The cover page settles a disagreement only between figures from one
  // filing. Net income from a proxy statement, often in millions (FedEx's
  // $4,433), disagrees with the 10-K's EPS x shares for another reason, and
  // the 10-K's own figure replaces it (rows.ts, needsAnnualReportFix).
  const filing = candidates[0]?.accn;
  const oneFiling = filing != null && values.eps_diluted?.accn === filing && values.shares_diluted?.accn === filing;
  return settleNetIncome(
    candidates,
    values.eps_diluted?.val ?? null,
    values.shares_diluted?.val ?? null,
    values.operating_income?.val ?? null,
    oneFiling ? coverShares(company, end) : null,
  );
}

// The share count on the cover of the annual report for the year ending on
// `end`: the first cover dated on or after that day, within thirteen months
// (a 10-K's cover is dated a few weeks after the year ends, a 20-F's on the
// last day of the year).
function coverShares(company: CompanyFrames, end: string): number | null {
  const limit = Date.parse(end) + 396 * DAY_MS;
  const covers = valuesFor(company, "EntityCommonStockSharesOutstanding", "instant")
    .filter((v) => v.end >= end && Date.parse(v.end) <= limit)
    .sort((a, b) => (a.end < b.end ? -1 : 1));
  return covers[0]?.val ?? null;
}

// —— Years ——
// The annual periods that define a company's years: those of revenue, net
// income and operating cash flow. Every other line item is read for the same
// period ends.
const ANCHORS: InputItem[] = ["revenue", "net_income", "operating_cash_flow"];

function annualEnds(company: CompanyFrames): string[] {
  const periods = new Map<string, Period>();
  for (const item of ANCHORS) {
    for (const tag of SPEC.get(item)?.tags ?? []) {
      for (const v of valuesFor(company, tag, "duration")) periods.set(`${v.start}|${v.end}`, { start: v.start!, end: v.end });
    }
  }
  return [...new Set(fiscalYearsOnly([...periods.values()]).map((p) => p.end))].sort().reverse();
}

// —— Twelve months that aren't a fiscal year ——
// A 10-Q sometimes tags a trailing twelve months: Amazon's third-quarter
// report gives net income, operating cash flow and capex for the year to 30
// September 2026, and the frames file that span under CY2026 like any annual
// figure. Taken as Amazon's latest year, it had no revenue and no prior year
// (twenty-company check, 5 November 2026). The normaliser never sees these,
// because it builds years from 10-Ks only; the frames don't say which filing
// type a figure came from.
//
// What gives a trailing twelve months away is overlap. A company's fiscal
// years follow one another, never overlapping by more than the odd day, even
// across a change of year-end (H&R Block moved from April to June in 2022, with
// a two-month transition period between, which no annual frame holds). A
// trailing twelve months overlaps a fiscal year by a quarter or more: Amazon's
// year to September 2026 overlaps its 2025 fiscal year by three months. So when
// two annual spans overlap by more than a month, the one ending on the odd
// date (fewer of the company's other years end within ten days of it, the
// slack 52- and 53-week years need) is dropped; on a tie, the one that doesn't
// match the newest year-end. Checking against the usual year-end alone was
// tried first and wrongly dropped 42 companies whose year-end had changed,
// because ten years of the old date outnumbered the new one.
export type Period = { start: string; end: string };

const YEAR_END_SLACK_DAYS = 10;
const MAX_OVERLAP_DAYS = 31;

function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS);
}

function sameYearEnd(a: string, b: string): boolean {
  const diff = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(diff, 365 - diff) <= YEAR_END_SLACK_DAYS;
}

export function fiscalYearsOnly(periods: Period[]): Period[] {
  if (periods.length <= 1) return periods;
  const newest = periods.reduce((a, b) => (b.end > a.end ? b : a)).end;
  const support = (p: Period) => periods.filter((o) => sameYearEnd(o.end, p.end)).length;
  const dropped = new Set<Period>();
  for (const a of periods) {
    for (const b of periods) {
      if (a === b || dropped.has(a) || dropped.has(b)) continue;
      const overlap = (Math.min(Date.parse(a.end), Date.parse(b.end)) - Math.max(Date.parse(a.start), Date.parse(b.start))) / DAY_MS;
      if (overlap <= MAX_OVERLAP_DAYS) continue;
      const sa = support(a);
      const sb = support(b);
      let loser: Period;
      if (sa !== sb) loser = sa < sb ? a : b;
      else if (sameYearEnd(a.end, newest) !== sameYearEnd(b.end, newest)) loser = sameYearEnd(a.end, newest) ? b : a;
      else loser = a.end < b.end ? a : b;
      dropped.add(loser);
    }
  }
  return periods.filter((p) => !dropped.has(p));
}

// Newest first, each year ending 340 to 380 days before the one after it. A
// missing year ends the chain: growth across a gap is not a yearly rate.
export function yearChain(ends: string[]): string[] {
  if (ends.length === 0) return [];
  const chain = [ends[0]];
  for (;;) {
    const last = Date.parse(chain[chain.length - 1]);
    const candidates = ends.filter((e) => {
      const days = (last - Date.parse(e)) / DAY_MS;
      return days >= 340 && days <= 380;
    });
    if (candidates.length === 0) return chain;
    candidates.sort((a, b) => Math.abs((last - Date.parse(a)) / DAY_MS - 365) - Math.abs((last - Date.parse(b)) / DAY_MS - 365));
    chain.push(candidates[0]);
  }
}

export type BalanceItem =
  | "cash_and_equivalents"
  | "total_assets"
  | "total_equity"
  | "total_debt"
  | "current_assets"
  | "current_liabilities"
  | "cash_and_short_term_investments"
  | "short_term_investments"
  | "debt_current"
  | "long_term_debt_current"
  | "short_term_borrowings"
  | "long_term_debt_noncurrent"
  | "customer_funds"
  | "settlement_balances"
  | "restricted_cash"
  | "cash_with_restricted"
  | "restricted_cash_current"
  | "restricted_cash_noncurrent"
  | "securities_total"
  | "securities_noncurrent";

const BALANCE_ITEMS: BalanceItem[] = [
  "cash_and_equivalents",
  "total_assets",
  "total_equity",
  "total_debt",
  "current_assets",
  "current_liabilities",
  "cash_and_short_term_investments",
  "short_term_investments",
  "debt_current",
  "long_term_debt_current",
  "short_term_borrowings",
  "long_term_debt_noncurrent",
  "customer_funds",
  "settlement_balances",
  "restricted_cash",
  "cash_with_restricted",
  "restricted_cash_current",
  "restricted_cash_noncurrent",
  "securities_total",
  "securities_noncurrent",
];

export type DurationItem = Exclude<InputItem, BalanceItem | "cover_shares">;

const DURATION_ITEMS: DurationItem[] = [
  ...(Object.keys(CONCEPT_TAGS) as InputItem[]),
  ...(Object.keys(SCREENER_CONCEPT_TAGS) as InputItem[]),
].filter((item): item is DurationItem => SPEC.get(item)?.kind === "duration");

export type CompanyYear = {
  periodStart: string | null;
  periodEnd: string;
  values: Partial<Record<DurationItem, Picked>>;
  // Line items left out because the filing's own figures disagree by a
  // units factor and nothing settles it (lib/sec/units.ts).
  inconsistent: DurationItem[];
  // The filing whose dollar figures are all in the wrong units (units.ts,
  // settleNetIncome): revenue and net income are then n/a, and so is
  // anything else in dollars from it.
  dollarsInOtherUnits?: string;
};

export type Assembled = {
  cik: number;
  name: string;
  latest: CompanyYear;
  prior: CompanyYear | null;
  // Balance sheet on the latest year's closing date.
  balance: Partial<Record<BalanceItem, Picked>>;
  // Revenue for each year of the chain, newest first; null where the year
  // exists but revenue wasn't filed for it, or was inconsistent (the index is
  // then in revenueHistoryInconsistent).
  revenueHistory: (Picked | null)[];
  revenueHistoryInconsistent: number[];
  // Three fiscal years before the latest, for the change in operating margin:
  // that year's revenue (revenueHistory[3]) and operating income. Null when
  // the chain of consecutive years doesn't reach back that far.
  threeYearsBack: { periodEnd: string; revenue: Picked | null; operating_income: Picked | null } | null;
};

export type AssembleResult =
  | { ok: true; company: Assembled }
  | { ok: false; cik: number; name: string; reason: "no-annual" | "stale"; periodEnd?: string };

function yearValues(company: CompanyFrames, end: string, ranked: Map<DurationItem, string[]>): CompanyYear {
  const values: Partial<Record<DurationItem, Picked>> = {};
  const inconsistent: DurationItem[] = [];
  let periodStart: string | null = null;
  const noteStart = (hit: Picked) => {
    periodStart ??= (company.byTag.get(hit.tag) ?? []).find((v) => v.end === end && isAnnual(v))?.start ?? null;
  };
  for (const item of DURATION_ITEMS) {
    if (SETTLED.has(item)) continue; // settled below, once the figures they're checked against are in
    const hit = pick(company, item, end, ranked.get(item));
    if (!hit) continue;
    values[item] = hit;
    noteStart(hit);
  }
  for (const item of ["revenue", "operating_cash_flow", "net_income"] as const) {
    const settled = settle(company, item, end, ranked.get(item) ?? [], values);
    if (settled.picked) {
      values[item] = settled.picked;
      noteStart(settled.picked);
    }
    if (settled.inconsistent) inconsistent.push(item);
    if (settled.dollarsInOtherUnits) {
      // Revenue from the same filing is in the same wrong units, so it goes
      // too.
      const filing = values.eps_diluted?.accn ?? "unknown";
      if (values.revenue?.accn === filing) {
        delete values.revenue;
        if (!inconsistent.includes("revenue")) inconsistent.push("revenue");
      }
      return { periodStart, periodEnd: end, values, inconsistent, dollarsInOtherUnits: filing };
    }
  }
  return { periodStart, periodEnd: end, values, inconsistent };
}

export function assembleCompany(company: CompanyFrames, today: string): AssembleResult {
  const chain = yearChain(annualEnds(company));
  if (chain.length === 0) return { ok: false, cik: company.cik, name: company.name, reason: "no-annual" };
  const latestEnd = chain[0];
  if (latestEnd < reportCutoff(today)) {
    return { ok: false, cik: company.cik, name: company.name, reason: "stale", periodEnd: latestEnd };
  }

  const ranked = new Map(DURATION_ITEMS.map((item) => [item, rankedTags(company, item)]));
  const latest = yearValues(company, latestEnd, ranked);
  const prior = chain[1] ? yearValues(company, chain[1], ranked) : null;

  const balance: Partial<Record<BalanceItem, Picked>> = {};
  for (const item of BALANCE_ITEMS) {
    const hit = item === "cash_and_equivalents" ? pickCash(company, latestEnd) : pick(company, item, latestEnd);
    if (hit) balance[item] = hit;
  }

  const revenueHistoryInconsistent: number[] = [];
  const revenueHistory = chain.map((end, i) => {
    const checks: Partial<Record<DurationItem, Picked>> = {};
    for (const item of ["gross_profit", "cost_of_revenue"] as const) {
      const hit = pick(company, item, end, ranked.get(item));
      if (hit) checks[item] = hit;
    }
    const settled = settle(company, "revenue", end, ranked.get("revenue") ?? [], checks);
    const year = i === 0 ? latest : i === 1 ? prior : null;
    const otherUnits = year?.dollarsInOtherUnits != null && settled.picked?.accn === year.dollarsInOtherUnits;
    if (settled.inconsistent || otherUnits) revenueHistoryInconsistent.push(i);
    return otherUnits ? null : settled.picked;
  });

  const threeYearsBack = chain[3]
    ? { periodEnd: chain[3], revenue: revenueHistory[3] ?? null, operating_income: pick(company, "operating_income", chain[3], ranked.get("operating_income")) }
    : null;

  return {
    ok: true,
    company: { cik: company.cik, name: company.name, latest, prior, balance, revenueHistory, revenueHistoryInconsistent, threeYearsBack },
  };
}

// —— A figure as the annual report states it ——
// From a company's full history for one tag (client.ts, fetchCompanyConcept),
// the value for exactly this period from its 10-Ks: the latest 10-K's, which
// is the original figure unless a later 10-K restated it. Only when no 10-K
// has the period does a 10-Q's count. Proxy statements and 8-Ks never do.
//
// 10-K first since 7 November 2026: JAKKS Pacific's first-quarter 2026 10-Q
// tagged its first quarter of 2025 with the whole year's dates, and as the
// latest filing it had been winning over the 10-K.
export function annualReportFact(facts: SecFact[], start: string, end: string): SecFact | null {
  const latest = (form: RegExp) => {
    const filed = facts.filter((f) => form.test(f.form) && f.start === start && f.end === end).sort((a, b) => (a.filed < b.filed ? -1 : 1));
    return filed.length ? filed[filed.length - 1] : null;
  };
  return latest(/^10-K/) ?? latest(/^10-Q/);
}

export function annualReportValue(facts: SecFact[], start: string, end: string): number | null {
  return annualReportFact(facts, start, end)?.val ?? null;
}
