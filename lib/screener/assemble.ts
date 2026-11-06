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
  return settleNetIncome(
    candidates,
    values.eps_diluted?.val ?? null,
    values.shares_diluted?.val ?? null,
    values.operating_income?.val ?? null,
  );
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

export type DurationItem = Exclude<
  InputItem,
  | "cash_and_equivalents"
  | "total_assets"
  | "total_equity"
  | "total_debt"
  | "current_assets"
  | "current_liabilities"
  | "cash_with_restricted"
  | "restricted_cash_current"
  | "restricted_cash_noncurrent"
>;

const DURATION_ITEMS: DurationItem[] = [
  ...(Object.keys(CONCEPT_TAGS) as InputItem[]),
  ...(Object.keys(SCREENER_CONCEPT_TAGS) as InputItem[]),
].filter((item): item is DurationItem => SPEC.get(item)?.kind === "duration");

export type BalanceItem = "cash_and_equivalents" | "total_assets" | "total_equity" | "total_debt" | "current_assets" | "current_liabilities";
const BALANCE_ITEMS: BalanceItem[] = ["cash_and_equivalents", "total_assets", "total_equity", "total_debt", "current_assets", "current_liabilities"];

export type CompanyYear = {
  periodStart: string | null;
  periodEnd: string;
  values: Partial<Record<DurationItem, Picked>>;
  // Line items left out because the filing's own figures disagree by a
  // units factor and nothing settles it (lib/sec/units.ts).
  inconsistent: DurationItem[];
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
    if (settled.inconsistent) revenueHistoryInconsistent.push(i);
    return settled.picked;
  });

  return {
    ok: true,
    company: { cik: company.cik, name: company.name, latest, prior, balance, revenueHistory, revenueHistoryInconsistent },
  };
}

// —— A figure as the annual report states it ——
// From a company's full history for one tag (client.ts, fetchCompanyConcept),
// the value for exactly this period from its 10-Ks and 10-Qs only, by the
// normaliser's rule (normalize.ts, resolvePeriod): the earliest such filing's
// value, or the latest one's if a later 10-K or 10-Q changed it. Proxy
// statements and 8-Ks don't count, exactly as on the research file.
export function annualReportFact(facts: SecFact[], start: string, end: string): SecFact | null {
  const filed = facts
    .filter((f) => /^10-[KQ]/.test(f.form) && f.start === start && f.end === end)
    .sort((a, b) => (a.filed < b.filed ? -1 : 1));
  // Earliest unless restated, then latest: either way, the latest filing's
  // value, since an unrestated figure is the same in every filing.
  return filed.length ? filed[filed.length - 1] : null;
}

export function annualReportValue(facts: SecFact[], start: string, end: string): number | null {
  return annualReportFact(facts, start, end)?.val ?? null;
}
