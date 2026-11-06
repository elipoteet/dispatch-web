// companyfacts -> clean, comparable rows. Pure functions, no I/O, so every rule
// below is unit-testable against saved real SEC responses.
//
// This is the part of phase nine where wrong numbers come from, so each rule is
// written out with the evidence behind it. All of it was checked against real
// companyfacts for NVDA, AAPL, JPM and CULP in October 2026.

import {
  CONCEPT_TAGS,
  INSTANT_ITEMS,
  NON_ADDITIVE_ITEMS,
  filerKindFromSic,
  suppressedItems,
  unitFor,
  type FilerKind,
  type LineItem,
  type TaggedLineItem,
} from "@/lib/sec/concepts";
import { settleCashFlow, settleNetIncome, settleRevenue, type Settled } from "@/lib/sec/units";

// One fact as the SEC serves it, inside facts[taxonomy][tag].units[unit].
export type SecFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
};

export type CompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
};

export type FiscalPeriod = "FY" | "Q1" | "Q2" | "Q3" | "Q4";

export type FinancialRow = {
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  periodEnd: string;
  lineItem: LineItem;
  value: number;
  unit: string;
  // Which XBRL tag the number actually came from. Stored so a surprising figure
  // can be traced to its tag without re-downloading several megabytes.
  sourceTag: string;
  accession: string;
  filedAt: string;
  // True when a later filing changed a figure a previous filing had reported.
  restated: boolean;
  // True when we computed it rather than read it: Q4, an unwound year-to-date
  // quarter, or free cash flow.
  derived: boolean;
  // Which provider the figure came from. "sec" for everything the SEC's own
  // companyfacts API carries; "finnhub" only where that API has no standard tag
  // and the filing's as-reported line was used instead (see capexFallback.ts).
  // Stored so a figure's provenance survives into the database and the UI.
  source: "sec" | "finnhub";
};

const DAY_MS = 86_400_000;

function spanDays(fact: SecFact): number | null {
  if (!fact.start) return null;
  return Math.round((new Date(fact.end).getTime() - new Date(fact.start).getTime()) / DAY_MS);
}

// A "year" is 340 to 380 days — fiscal years are 52 or 53 weeks, so NVDA's
// fiscal 2026 is 363 days, not 365. A "quarter" is 80 to 100 days. Anything
// between is a year-to-date stub (a 10-Q's 181- or 272-day column), useful only
// as raw material for subtraction.
function isAnnualSpan(d: number | null): boolean {
  return d != null && d >= 340 && d <= 380;
}
function isQuarterSpan(d: number | null): boolean {
  return d != null && d >= 80 && d <= 100;
}

// Only the periodic reports count — 10-K, 10-Q, and their amendments.
//
// Companies also tag figures into 8-Ks, S-1s and prospectuses, and those are not
// the annual report. The twenty-company check caught exactly why this matters:
// Eli Lilly's 2016 revenue is $21.222B, stated identically in the 2016, 2017 and
// 2018 annual reports, but an 8-K filed in October 2019 recast the year to
// $18.313B to strip out Elanco ahead of the separation. Taking the most recent
// filing of any kind let that 8-K overrule three annual reports and left the
// year disagreeing with its own quarters.
//
// Both numbers are real; only one of them is what the 10-K says.
function isPeriodicReport(form: string): boolean {
  return /^10-[KQ]/.test(form);
}

// ============================================================
// The fiscal calendar
// ============================================================
// Everything downstream depends on answering "which fiscal year and quarter is
// this figure for?", and the obvious answer is wrong.
//
// The `fp` field cannot do it. `fp` describes the FILING, not the fact: inside a
// 10-K, the fourth-quarter column and the full-year column BOTH carry fp:"FY",
// because the filing is an annual one. Trusting it labels a 90-day figure as a
// full year — NVIDIA's fiscal 2019 net income appeared as both $0.567B (the
// quarter) and $4.141B (the year), under identical labels.
//
// The `fy` field cannot do it either, for the same underlying reason. Every 10-K
// restates the prior two years as comparatives, and those rows carry the NEW
// filing's fy — NVDA's year ending 2021-01-31 appears as fy:2021 in its own 10-K
// and fy:2022 in the next one.
//
// And `frame` cannot do it: it aligns periods to CALENDAR years, so NVDA's
// fiscal 2021 carries frame "CY2020".
//
// So we rebuild the company's own fiscal calendar from the annual periods it has
// actually filed, and place every other figure inside it by date. The fiscal
// year label still comes from the SEC — the fy on the EARLIEST filing of that
// annual period, which is the original 10-K, where fy does describe the period.
// That matters because a January year-end belongs to different years at
// different companies (NVIDIA's January 2026 year-end is fiscal 2026; a
// retailer's is usually fiscal 2025), and only the filer knows which.
type FiscalYearSpan = { start: string; end: string; fiscalYear: number };

function buildFiscalCalendar(companyFacts: CompanyFacts): FiscalYearSpan[] {
  const taxonomy = companyFacts.facts["us-gaap"] ?? {};
  // Keyed by exact period so restatements of one year collapse together.
  const byPeriod = new Map<string, SecFact[]>();

  for (const tags of Object.values(CONCEPT_TAGS)) {
    for (const tag of tags) {
      for (const rows of Object.values(taxonomy[tag]?.units ?? {})) {
        for (const fact of rows) {
          if (fact.form !== "10-K" || !isAnnualSpan(spanDays(fact))) continue;
          const key = `${fact.start}|${fact.end}`;
          const bucket = byPeriod.get(key);
          if (bucket) bucket.push(fact);
          else byPeriod.set(key, [fact]);
        }
      }
    }
  }

  const spans: FiscalYearSpan[] = [];
  for (const [key, facts] of byPeriod) {
    const original = facts.slice().sort((a, b) => (a.filed < b.filed ? -1 : 1))[0];
    const [start, end] = key.split("|");
    spans.push({ start, end, fiscalYear: original.fy });
  }
  spans.sort((a, b) => (a.end < b.end ? -1 : 1));

  // One label per year. If two spans somehow claim the same fiscal year, the
  // later-ending one wins — that is the real year, the other a transition stub.
  const byYear = new Map<number, FiscalYearSpan>();
  for (const span of spans) byYear.set(span.fiscalYear, span);
  return [...byYear.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
}

// Projects the calendar forward for the year in progress, whose annual period
// has not been filed yet. Without this, the current year's quarters have no home.
function projectedYear(calendar: FiscalYearSpan[], endDate: string): FiscalYearSpan | null {
  const last = calendar[calendar.length - 1];
  if (!last || endDate <= last.end) return null;
  const start = new Date(new Date(last.end).getTime() + DAY_MS).toISOString().slice(0, 10);
  const end = new Date(new Date(last.end).getTime() + 364 * DAY_MS).toISOString().slice(0, 10);
  if (endDate > end) return null;
  return { start, end, fiscalYear: last.fiscalYear + 1 };
}

// Which quarter is this? A figure ending on the fiscal year end is Q4 by
// definition. Otherwise a 10-Q's own fp is trustworthy (a 10-Q IS that quarter's
// filing). Anything else is placed by how far into the year it ends.
function quarterFor(fact: SecFact, year: FiscalYearSpan): FiscalPeriod {
  if (fact.end === year.end) return "Q4";
  if (fact.form === "10-Q" && (fact.fp === "Q1" || fact.fp === "Q2" || fact.fp === "Q3")) return fact.fp;
  const elapsed = (new Date(fact.end).getTime() - new Date(year.start).getTime()) / DAY_MS;
  const index = Math.min(3, Math.max(0, Math.round(elapsed / 91) - 1));
  return (["Q1", "Q2", "Q3", "Q4"] as const)[index];
}

// Group every fact for one tag by the exact period it covers, so restatements of
// the same period land together and can be compared.
function groupByPeriod(facts: SecFact[]): Map<string, SecFact[]> {
  const out = new Map<string, SecFact[]>();
  for (const f of facts) {
    const key = `${f.start ?? ""}|${f.end}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(f);
    else out.set(key, [f]);
  }
  return out;
}

// The canonical value for a period, and whether it was restated.
//
// Rule from the brief: take the value from the earliest filing that reported it;
// if a later filing changed it, show the latest and mark the cell. Both halves
// matter — the first keeps a figure stable once published, the second stops us
// showing a number the company has since corrected.
function resolvePeriod(facts: SecFact[]): { fact: SecFact; restated: boolean } | null {
  const ordered = facts.slice().sort((a, b) => (a.filed < b.filed ? -1 : 1));
  const first = ordered[0];
  if (!first) return null;
  const last = ordered[ordered.length - 1];
  const restated = last.val !== first.val;
  return { fact: restated ? last : first, restated };
}

type Candidate = { fact: SecFact; restated: boolean; tag: string };

// Balance-sheet items whose quarter-ends each take the first tag that has them,
// instead of one tag for the year. See the note where it's applied.
const PER_DATE_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>(["total_debt"]);

// Which tag to believe when a company files more than one that could answer for
// the same line item.
//
// Taking them in list order is wrong, and the twenty-company check is what
// proved it. Walmart files both "total revenues" and "net sales"; Eli Lilly
// files a narrow revenue tag alongside a complete one. Picking per-period meant
// a single column could mix them — Walmart's fiscal 2017 showed a year of
// $481.3B against quarters summing to $485.9B, because the year came from one
// tag and the quarters from another. Both numbers are real; putting them in the
// same column is the error.
//
// So: prefer the tag that covers the most annual periods, which is the one the
// company uses as its own headline, and fall back down the list only for periods
// that tag does not cover. A genuine mid-history switch (NVIDIA moving from
// RevenueFromContractWithCustomerExcludingAssessedTax to Revenues) still works,
// because the two cover different years and neither can fill the other's gap.
function rankTags(
  companyFacts: CompanyFacts,
  item: TaggedLineItem,
  unit: string,
): string[] {
  const taxonomy = companyFacts.facts["us-gaap"] ?? {};
  const listed = CONCEPT_TAGS[item];
  return listed
    .map((tag, index) => {
      const rows = taxonomy[tag]?.units?.[unit] ?? [];
      const annualEnds = new Set(
        rows.filter((f) => f.form === "10-K" && isAnnualSpan(spanDays(f))).map((f) => f.end),
      );
      return { tag, index, coverage: annualEnds.size };
    })
    .sort((a, b) => b.coverage - a.coverage || a.index - b.index)
    .map((t) => t.tag);
}

// Every period one tag covers, restatements already resolved.
function periodsForTag(
  companyFacts: CompanyFacts,
  tag: string,
  unit: string,
): Map<string, Candidate> | null {
  const rows = companyFacts.facts["us-gaap"]?.[tag]?.units?.[unit]?.filter((f) => isPeriodicReport(f.form));
  if (!rows?.length) return null;
  const byPeriod = new Map<string, Candidate>();
  for (const [periodKey, facts] of groupByPeriod(rows)) {
    const resolved = resolvePeriod(facts);
    if (resolved) byPeriod.set(periodKey, { ...resolved, tag });
  }
  return byPeriod;
}

// What one tag has to say about one fiscal year.
type YearSlice = {
  annual: Candidate | null;
  quarters: Map<FiscalPeriod, Candidate>;
  ytd: { candidate: Candidate; days: number; period: FiscalPeriod }[];
};

function sliceYear(periods: Map<string, Candidate>, year: FiscalYearSpan, isInstant: boolean): YearSlice {
  const slice: YearSlice = { annual: null, quarters: new Map(), ytd: [] };
  for (const [, candidate] of periods) {
    const fact = candidate.fact;
    if (!(fact.end > year.start && fact.end <= year.end)) continue;
    const days = spanDays(fact);

    if (isInstant) {
      const period = quarterFor(fact, year);
      if (!slice.quarters.has(period)) slice.quarters.set(period, candidate);
      continue;
    }
    if (isAnnualSpan(days)) {
      if (fact.end === year.end && !slice.annual) slice.annual = candidate;
    } else if (isQuarterSpan(days)) {
      const period = quarterFor(fact, year);
      if (!slice.quarters.has(period)) slice.quarters.set(period, candidate);
    } else if (days != null) {
      slice.ytd.push({ candidate, days, period: quarterFor(fact, year) });
    }
  }
  return slice;
}

// —— Cash from the total that includes restricted cash ——
// Some balance sheets tag their cash line with a company-specific element that
// the SEC's summary data leaves out: Chevron's year-ends of 2019, 2024 and 2025,
// for one. The cash-flow statement's total, cash including restricted cash, is
// always there in a standard tag. That total less the restricted cash filed for
// the same date, current and non-current, is the balance sheet's figure
// exactly: Chevron's 2019 is $6,911M − $452M − $773M = $5,686M, its balance
// sheet's number, and the arithmetic agrees with the cash it did tag at all 26
// dates where both exist (checked November 2026).
//
// Only for a company that files its restricted cash in these tags, and only on
// a date where every one of them it uses has a value. Apple and NVIDIA keep
// some restricted cash without tagging it, so for them the total isn't cash.
export const CASH_WITH_RESTRICTED = "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents";
export const RESTRICTED_CASH_TAGS = [
  ["RestrictedCashCurrent", "RestrictedCashAndCashEquivalentsCurrent"],
  ["RestrictedCashNoncurrent", "RestrictedCashAndCashEquivalentsNoncurrent"],
];
// Named after both inputs, as free cash flow is, so it reads as calculated.
const CASH_FROM_TOTAL = `${CASH_WITH_RESTRICTED} - restricted cash`;

function cashFromTotal(companyFacts: CompanyFacts, unit: string): Map<string, Candidate> | null {
  const total = periodsForTag(companyFacts, CASH_WITH_RESTRICTED, unit);
  if (!total) return null;
  const byEnd = (periods: Map<string, Candidate> | null) => (periods ? new Map([...periods.values()].map((c) => [c.fact.end, c])) : null);
  const groups = RESTRICTED_CASH_TAGS.map((tags) =>
    tags.map((tag) => byEnd(periodsForTag(companyFacts, tag, unit))).filter((m): m is Map<string, Candidate> => m != null),
  );
  if (groups.every((g) => g.length === 0)) return null;
  const out = new Map<string, Candidate>();
  for (const [key, candidate] of total) {
    if (candidate.fact.start) continue;
    let restricted = 0;
    let complete = true;
    for (const maps of groups) {
      if (maps.length === 0) continue;
      const hit = maps.map((m) => m.get(candidate.fact.end)).find((c) => c != null);
      if (!hit) {
        complete = false;
        break;
      }
      restricted += hit.fact.val;
    }
    if (!complete) continue;
    out.set(key, { fact: { ...candidate.fact, val: candidate.fact.val - restricted }, restated: candidate.restated, tag: CASH_FROM_TOTAL });
  }
  return out.size > 0 ? out : null;
}

function isEmptySlice(slice: YearSlice): boolean {
  return !slice.annual && slice.quarters.size === 0 && slice.ytd.length === 0;
}

function rowFrom(
  item: LineItem,
  candidate: Candidate,
  fiscalYear: number,
  fiscalPeriod: FiscalPeriod,
  unit: string,
  derived = false,
): FinancialRow {
  return {
    fiscalYear,
    fiscalPeriod,
    periodEnd: candidate.fact.end,
    lineItem: item,
    value: candidate.fact.val,
    unit,
    sourceTag: candidate.tag,
    accession: candidate.fact.accn,
    filedAt: candidate.fact.filed,
    restated: candidate.restated,
    derived,
    source: "sec",
  };
}

// —— Units errors in the filing ——
// For each fiscal year, the annual figures each of a company's tags gives for
// revenue, net income and operating cash flow, settled by lib/sec/units.ts
// when two of them disagree by a units factor (Tigo Energy's 2025 revenue:
// $103.5 million under one tag, $103.5 billion under another, in the same
// 10-K). The answer is either a tag to use for the whole year, quarters
// included, or null: the year is left blank for that line item. No entry means
// nothing to settle, and the usual tag choice stands.
//
// Annual figures only. A units error confined to one quarter's 10-Q isn't
// caught here; none was seen in the November 2026 checks.
type UnitsDecision = string | null;

function settleUnits(companyFacts: CompanyFacts, years: FiscalYearSpan[]): Map<TaggedLineItem, Map<number, UnitsDecision>> {
  const out = new Map<TaggedLineItem, Map<number, UnitsDecision>>();
  const prepared = new Map<TaggedLineItem, { tag: string; periods: Map<string, Candidate> }[]>();
  const tagsFor = (item: TaggedLineItem) => {
    let list = prepared.get(item);
    if (!list) {
      const unit = unitFor(item);
      list = rankTags(companyFacts, item, unit)
        .map((tag) => ({ tag, periods: periodsForTag(companyFacts, tag, unit) }))
        .filter((t): t is { tag: string; periods: Map<string, Candidate> } => t.periods != null);
      prepared.set(item, list);
    }
    return list;
  };
  const annuals = (item: TaggedLineItem, year: FiscalYearSpan) =>
    tagsFor(item)
      .map(({ tag, periods }) => ({ tag, annual: sliceYear(periods, year, false).annual }))
      .filter((t) => t.annual != null)
      .map((t) => ({ tag: t.tag, val: t.annual!.fact.val }));
  const first = (item: TaggedLineItem, year: FiscalYearSpan) => annuals(item, year)[0]?.val ?? null;
  const record = (item: TaggedLineItem, year: FiscalYearSpan, candidates: { tag: string }[], settled: Settled<{ tag: string }>) => {
    let decision: UnitsDecision | undefined;
    if (settled.inconsistent) decision = null;
    else if (settled.picked && settled.picked.tag !== candidates[0]?.tag) decision = settled.picked.tag;
    if (decision === undefined) return;
    if (!out.has(item)) out.set(item, new Map());
    out.get(item)!.set(year.fiscalYear, decision);
  };

  for (const year of years) {
    const revenue = annuals("revenue", year);
    if (revenue.length > 0) record("revenue", year, revenue, settleRevenue(revenue, first("gross_profit", year), first("cost_of_revenue", year)));
    const cashFlow = annuals("operating_cash_flow", year);
    if (cashFlow.length > 0) record("operating_cash_flow", year, cashFlow, settleCashFlow(cashFlow));
    const income = annuals("net_income", year);
    if (income.length > 0) {
      record(
        "net_income",
        year,
        income,
        settleNetIncome(income, first("eps_diluted", year), first("shares_diluted", year), first("operating_income", year)),
      );
    }
  }
  return out;
}

export type NormalizeOptions = {
  sic?: string | number | null;
};

export type NormalizeResult = {
  rows: FinancialRow[];
  filerKind: FilerKind;
  // Present when some line items are deliberately not shown for this kind of
  // company — the page states this rather than leaving a silent gap.
  suppression: { items: LineItem[]; reason: string } | null;
};

export function normalizeCompanyFacts(
  companyFacts: CompanyFacts,
  options: NormalizeOptions = {},
): NormalizeResult {
  const filerKind = filerKindFromSic(options.sic);
  const suppression = suppressedItems(filerKind);
  const suppressed = new Set<LineItem>(suppression?.items ?? []);
  const calendar = buildFiscalCalendar(companyFacts);
  const rows: FinancialRow[] = [];

  const items = Object.keys(CONCEPT_TAGS) as TaggedLineItem[];

  // Which fiscal years exist at all, including the one in progress whose 10-K
  // has not been filed yet.
  const years: FiscalYearSpan[] = [...calendar];
  {
    const taxonomy = companyFacts.facts["us-gaap"] ?? {};
    let latest = "";
    for (const tags of Object.values(CONCEPT_TAGS)) {
      for (const tag of tags) {
        for (const unitRows of Object.values(taxonomy[tag]?.units ?? {})) {
          for (const fact of unitRows) {
            if (isPeriodicReport(fact.form) && fact.end > latest) latest = fact.end;
          }
        }
      }
    }
    const projected = latest ? projectedYear(calendar, latest) : null;
    if (projected) years.push(projected);
  }

  const unitsDecisions = settleUnits(companyFacts, years);

  for (const item of items) {
    if (suppressed.has(item)) continue;
    const unit = unitFor(item);
    const isInstant = INSTANT_ITEMS.has(item);
    const ranked = rankTags(companyFacts, item, unit);

    // Every tag's periods, built once per line item.
    const perTag = new Map<string, Map<string, Candidate>>();
    for (const tag of ranked) {
      const periods = periodsForTag(companyFacts, tag, unit);
      if (periods) perTag.set(tag, periods);
    }
    // Cash worked out from the restricted-cash total (see cashFromTotal) ranks
    // straight after the company's own cash tag: the same figure, where that
    // tag is missing, ahead of the total that still includes restricted cash.
    const derivedCash = item === "cash_and_equivalents" ? cashFromTotal(companyFacts, unit) : null;
    if (derivedCash) perTag.set(CASH_FROM_TOTAL, derivedCash);
    const order = derivedCash ? [ranked[0], CASH_FROM_TOTAL, ...ranked.slice(1)] : ranked;

    // —— One tag per line item per fiscal year ——
    // Tag choice is made for a whole year at a time, not period by period. A year
    // whose annual figure comes from one tag and whose quarters come from another
    // is not a row of comparable numbers: Caterpillar files `ProfitLoss` (which
    // includes noncontrolling interests) alongside
    // `NetIncomeLossAvailableToCommonStockholdersBasic` (which does not), and
    // Verizon files capex under two different concepts in the same year. Both are
    // real figures; putting them in one row is the error.
    //
    // The tag that reports the full year wins, because that is the one the
    // company's own annual statement uses. Only if no tag has the year do we fall
    // back to the best-covering tag that has anything at all — which is how a
    // year still in progress gets its quarters.
    //
    // The cost is that a year can lose its quarters when the annual tag has none.
    // That is the right trade: a blank is fine, a wrong number is not.
    for (const year of years) {
      let chosen: { tag: string; slice: YearSlice } | null = null;
      let fallback: { tag: string; slice: YearSlice } | null = null;

      // A units error in the filing (settleUnits, below): either a tag forced
      // for the year, or the year left blank for this line item.
      const decision = unitsDecisions.get(item)?.get(year.fiscalYear);
      if (decision === null) continue;
      const yearOrder = decision ? [decision] : order;

      if (PER_DATE_ITEMS.has(item)) {
        // —— Debt: each balance-sheet date stands alone ——
        // One tag for the whole year lost three quarters of debt at most large
        // filers, and with them enterprise value for three quarters in four:
        // Alphabet, Meta and Procter & Gamble file LongTermDebt (which includes
        // the part due within a year) in their 10-Ks and LongTermDebtNoncurrent
        // (which doesn't) in their 10-Qs. So each date takes the first tag that
        // has it, and keeps its own tag. The cost, stated on the page: a
        // quarter's debt can leave out the part due within the year, a few
        // percent of enterprise value at most. Cash, assets and equity keep one
        // tag a year; mixing there bought little and mixed definitions.
        const merged: YearSlice = { annual: null, quarters: new Map(), ytd: [] };
        for (const tag of ranked) {
          const periods = perTag.get(tag);
          if (!periods) continue;
          for (const [period, candidate] of sliceYear(periods, year, true).quarters) {
            if (!merged.quarters.has(period)) merged.quarters.set(period, candidate);
          }
        }
        if (merged.quarters.size > 0) chosen = { tag: ranked[0], slice: merged };
      } else {
        for (const tag of yearOrder) {
          const periods = perTag.get(tag);
          if (!periods) continue;
          const slice = sliceYear(periods, year, isInstant);
          if (isEmptySlice(slice)) continue;
          if (isInstant || slice.annual) {
            chosen = { tag, slice };
            break;
          }
          fallback ??= { tag, slice };
        }
        // A year whose own cash tag skips a date (Chevron's 2019 year-end)
        // takes that date's cash from the restricted-cash total: the same
        // figure, so the year doesn't mix definitions.
        if (derivedCash && chosen && chosen.tag !== CASH_FROM_TOTAL) {
          for (const [period, candidate] of sliceYear(derivedCash, year, true).quarters) {
            if (!chosen.slice.quarters.has(period)) chosen.slice.quarters.set(period, candidate);
          }
        }
      }
      // —— Same year, same total: quarters from either tag ——
      // JPMorgan files its full year under Revenues and its quarters only under
      // RevenuesNetOfInterestExpense, with the same total either way ($182.45B
      // for 2025); Alphabet filed its first quarter of 2024 under a different
      // revenue tag from the other three. Taking one tag left those quarters
      // blank, and with them the trailing-year revenue the Valuation tab
      // needs. A missing quarter is taken from another tag only if that tag's
      // full year matches to within 0.1%: then both describe the same number
      // and nothing is mixed.
      if (chosen && !isInstant && chosen.slice.annual) {
        const total = chosen.slice.annual.fact.val;
        const merged: YearSlice = {
          annual: chosen.slice.annual,
          quarters: new Map(chosen.slice.quarters),
          ytd: [...chosen.slice.ytd],
        };
        for (const tag of ranked) {
          const periods = tag === chosen.tag ? null : perTag.get(tag);
          if (!periods) continue;
          const slice = sliceYear(periods, year, false);
          if (!slice.annual || Math.abs(slice.annual.fact.val - total) > Math.abs(total) * 0.001) continue;
          for (const [period, candidate] of slice.quarters) {
            if (!merged.quarters.has(period)) merged.quarters.set(period, candidate);
          }
          for (const y of slice.ytd) {
            if (!merged.ytd.some((m) => m.period === y.period)) merged.ytd.push(y);
          }
        }
        chosen = { tag: chosen.tag, slice: merged };
      }

      const picked = chosen ?? fallback;
      if (!picked) continue;

      const { slice } = picked;
      const fiscalYear = year.fiscalYear;
      const slots = new Map<string, FinancialRow>();
      const put = (row: FinancialRow) => {
        if (!slots.has(row.fiscalPeriod)) slots.set(row.fiscalPeriod, row);
      };

      if (slice.annual) put(rowFrom(item, slice.annual, fiscalYear, "FY", unit));
      for (const [period, candidate] of slice.quarters) put(rowFrom(item, candidate, fiscalYear, period, unit, candidate.tag === CASH_FROM_TOTAL));

      if (!isInstant && !NON_ADDITIVE_ITEMS.has(item)) {
        // —— Unwind year-to-date quarters ——
        // Cash-flow statements in a 10-Q are cumulative from the year's start, and
        // for most filers that is the ONLY form the quarter appears in. NVDA's
        // fiscal 2026 operating cash flow exists as 90, 181, 272 and 363-day
        // spans and never as a standalone Q2 or Q3. Revenue, by contrast, is
        // filed both ways — so only subtract where a real quarter is missing.
        //
        // A quarter is its year-to-date total minus the year-to-date total
        // through the quarter before. For Q2 that earlier total is Q1's own
        // three months, which sits among the quarters, not the year-to-date
        // spans. Stages 1 to 3 subtracted only between year-to-date spans, so
        // Q2 kept the whole six months and Q4 (the year minus the rest) came
        // out short by Q1, below zero for Alphabet's buybacks in 2020, 2024 and
        // 2025. The years were always right, which is why no check caught it.
        const ytdByPeriod = new Map<FiscalPeriod, number>();
        for (const y of slice.ytd) {
          if (!ytdByPeriod.has(y.period)) ytdByPeriod.set(y.period, y.candidate.fact.val);
        }
        let throughPrevious: number | null = 0;
        for (const period of ["Q1", "Q2", "Q3"] as const) {
          const ytd = slice.ytd.find((y) => y.period === period);
          if (!slots.has(period) && ytd && throughPrevious != null) {
            put({
              ...rowFrom(item, ytd.candidate, fiscalYear, period, unit),
              value: ytd.candidate.fact.val - throughPrevious,
              derived: period !== "Q1",
            });
          }
          const own = slots.get(period);
          throughPrevious = ytdByPeriod.get(period) ?? (own && throughPrevious != null ? throughPrevious + own.value : null);
        }

        // —— Derive Q4 ——
        // A 10-K reports the full year, never a fourth quarter. Q4 is the year
        // minus the three filed quarters, and only when all three are present —
        // a missing quarter would silently inflate it.
        const fy = slots.get("FY");
        const q1 = slots.get("Q1");
        const q2 = slots.get("Q2");
        const q3 = slots.get("Q3");
        if (fy && q1 && q2 && q3 && !slots.has("Q4")) {
          put({
            ...fy,
            fiscalPeriod: "Q4",
            value: fy.value - (q1.value + q2.value + q3.value),
            derived: true,
          });
        }
      }

      rows.push(...slots.values());
    }
  }

  // —— Free cash flow ——
  // Operating cash flow minus capital expenditure. Not a reported line, so it is
  // flagged derived everywhere and must be labelled as ours in any UI. Skipped
  // entirely for banks and insurers, where it describes nothing.
  if (!suppressed.has("free_cash_flow")) {
    const capexBy = new Map(
      rows.filter((r) => r.lineItem === "capex").map((r) => [`${r.fiscalYear}|${r.fiscalPeriod}`, r]),
    );
    for (const cash of rows.filter((r) => r.lineItem === "operating_cash_flow")) {
      const capex = capexBy.get(`${cash.fiscalYear}|${cash.fiscalPeriod}`);
      if (!capex) continue;
      rows.push({
        ...cash,
        lineItem: "free_cash_flow",
        value: cash.value - capex.value,
        sourceTag: `${cash.sourceTag} - ${capex.sourceTag}`,
        restated: cash.restated || capex.restated,
        derived: true,
      });
    }
  }

  // —— Gross profit fallback ——
  // Some filers report revenue and cost of revenue but no GrossProfit line.
  // Subtracting is safe and exact when both halves are present for the period.
  if (!suppressed.has("gross_profit")) {
    const grossBy = new Set(
      rows.filter((r) => r.lineItem === "gross_profit").map((r) => `${r.fiscalYear}|${r.fiscalPeriod}`),
    );
    const costBy = new Map(
      rows.filter((r) => r.lineItem === "cost_of_revenue").map((r) => [`${r.fiscalYear}|${r.fiscalPeriod}`, r]),
    );
    for (const revenue of rows.filter((r) => r.lineItem === "revenue")) {
      const key = `${revenue.fiscalYear}|${revenue.fiscalPeriod}`;
      if (grossBy.has(key)) continue;
      const cost = costBy.get(key);
      if (!cost) continue;
      grossBy.add(key);
      rows.push({
        ...revenue,
        lineItem: "gross_profit",
        value: revenue.value - cost.value,
        sourceTag: `${revenue.sourceTag} - ${cost.sourceTag}`,
        restated: revenue.restated || cost.restated,
        derived: true,
      });
    }
  }

  rows.push(...extractCoverShares(companyFacts));

  rows.sort(
    (a, b) =>
      b.fiscalYear - a.fiscalYear ||
      a.fiscalPeriod.localeCompare(b.fiscalPeriod) ||
      a.lineItem.localeCompare(b.lineItem),
  );

  return { rows, filerKind, suppression };
}

// —— Shares outstanding, from each filing's cover page ——
// The front page of every 10-K and 10-Q states how many shares were
// outstanding on a date a few weeks after the period ended
// (dei:EntityCommonStockSharesOutstanding). Stage 4 needs them for market
// value over time.
//
// Unlike the income statement's share counts, these are never restated: each
// cover reports shares on its own date, in the units of that date. So a stock
// split shows up as a jump between covers (NVIDIA: 2,460M on 24 May 2024,
// 24,530M on 23 August 2024), and the valuation code converts each count to
// today's basis with the split factors it reads from prices.
//
// Stored with the filing's own fiscal year and period (fy/fp on a cover fact
// describe the filing, which is right here) and the cover date as period_end.
// Companies with several share classes file one count per class, which the
// SEC's company facts leave out; for those (Alphabet) there's nothing here and
// market value falls back to Finnhub's share count.
export function extractCoverShares(companyFacts: CompanyFacts): FinancialRow[] {
  const facts = companyFacts.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  const byPeriod = new Map<string, SecFact>();
  for (const fact of facts) {
    if (!isPeriodicReport(fact.form) || !fact.fy || !/^(FY|Q[1-4])$/.test(fact.fp) || !(fact.val > 0)) continue;
    const key = `${fact.fy}|${fact.fp}`;
    const seen = byPeriod.get(key);
    // An amendment repeats the cover: keep the original filing's count.
    if (!seen || fact.filed < seen.filed) byPeriod.set(key, fact);
  }
  return [...byPeriod.values()].map((fact) => ({
    fiscalYear: fact.fy,
    fiscalPeriod: fact.fp as FiscalPeriod,
    periodEnd: fact.end,
    lineItem: "shares_outstanding" as const,
    value: fact.val,
    unit: "shares",
    sourceTag: "dei:EntityCommonStockSharesOutstanding",
    accession: fact.accn,
    filedAt: fact.filed,
    restated: false,
    derived: false,
    source: "sec" as const,
  }));
}

// Convenience for the checks and for any caller that wants one figure.
export function pick(
  rows: FinancialRow[],
  item: LineItem,
  fiscalYear: number,
  fiscalPeriod: FiscalPeriod = "FY",
): FinancialRow | null {
  return (
    rows.find((r) => r.lineItem === item && r.fiscalYear === fiscalYear && r.fiscalPeriod === fiscalPeriod) ?? null
  );
}
