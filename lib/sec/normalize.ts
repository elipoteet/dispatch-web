// companyfacts -> clean, comparable rows. Pure functions, no I/O, so every rule
// below is unit-testable against saved real SEC responses.
//
// This is the part of phase nine where wrong numbers come from, so each rule is
// written out with the evidence behind it. All of it was checked against real
// companyfacts for NVDA, AAPL, JPM and CULP in October 2026.

import {
  CONCEPT_TAGS,
  INSTANT_ITEMS,
  filerKindFromSic,
  suppressedItems,
  unitFor,
  type FilerKind,
  type LineItem,
} from "@/lib/sec/concepts";

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

// Which fiscal year does a date fall in? Exact year-end match first, then
// containment, then the nearest year whose end is on or after the date — the
// last case covers quarters of a year whose 10-K has not been filed yet.
function fiscalYearFor(calendar: FiscalYearSpan[], endDate: string): FiscalYearSpan | null {
  for (const span of calendar) if (span.end === endDate) return span;
  for (const span of calendar) if (endDate > span.start && endDate <= span.end) return span;
  return null;
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
  item: Exclude<LineItem, "free_cash_flow">,
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

function collectByPeriod(
  companyFacts: CompanyFacts,
  item: Exclude<LineItem, "free_cash_flow">,
): Map<string, Candidate> {
  const unit = unitFor(item);
  const taxonomy = companyFacts.facts["us-gaap"] ?? {};
  const byPeriod = new Map<string, Candidate>();

  for (const tag of rankTags(companyFacts, item, unit)) {
    const rows = taxonomy[tag]?.units?.[unit]?.filter((f) => isPeriodicReport(f.form));
    if (!rows?.length) continue;
    for (const [periodKey, facts] of groupByPeriod(rows)) {
      if (byPeriod.has(periodKey)) continue; // a better-covering tag already filled it
      const resolved = resolvePeriod(facts);
      if (resolved) byPeriod.set(periodKey, { ...resolved, tag });
    }
  }
  return byPeriod;
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
  };
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

  const items = Object.keys(CONCEPT_TAGS) as Exclude<LineItem, "free_cash_flow">[];

  for (const item of items) {
    if (suppressed.has(item)) continue;
    const unit = unitFor(item);
    const byPeriod = collectByPeriod(companyFacts, item);
    const isInstant = INSTANT_ITEMS.has(item);

    // One slot per (fiscal year, period). Keyed this way from the start so two
    // different date ranges can never both claim to be, say, fiscal 2019's year.
    const slots = new Map<string, FinancialRow>();
    const ytd: { candidate: Candidate; days: number; year: FiscalYearSpan; period: FiscalPeriod }[] = [];

    const put = (row: FinancialRow) => {
      const key = `${row.fiscalYear}|${row.fiscalPeriod}`;
      // First writer wins: annual and quarterly facts are considered in a fixed
      // order below, and a later restatement has already been resolved upstream.
      if (!slots.has(key)) slots.set(key, row);
    };

    for (const [, candidate] of byPeriod) {
      const fact = candidate.fact;
      const year = fiscalYearFor(calendar, fact.end) ?? projectedYear(calendar, fact.end);
      if (!year) continue;
      const days = spanDays(fact);

      if (isInstant) {
        // Point-in-time. A balance-sheet date belongs to whichever period closed
        // on it, and these are never added together.
        put(rowFrom(item, candidate, year.fiscalYear, quarterFor(fact, year), unit));
        continue;
      }

      if (isAnnualSpan(days)) {
        // Only a span that actually ends on the fiscal year end is that year.
        // A trailing-twelve-month stub ending mid-year is not.
        if (fact.end === year.end) put(rowFrom(item, candidate, year.fiscalYear, "FY", unit));
      } else if (isQuarterSpan(days)) {
        put(rowFrom(item, candidate, year.fiscalYear, quarterFor(fact, year), unit));
      } else if (days != null) {
        ytd.push({ candidate, days, year, period: quarterFor(fact, year) });
      }
    }

    if (!isInstant) {
      // —— Unwind year-to-date quarters ——
      // Cash-flow statements in a 10-Q are cumulative from the year's start, and
      // for most filers that is the ONLY form the quarter appears in. NVDA's
      // fiscal 2026 operating cash flow exists as 90, 181, 272 and 363-day spans
      // and never as a standalone Q2 or Q3. Revenue, by contrast, is filed both
      // ways — so only subtract where a real standalone quarter is missing.
      const byYear = new Map<number, typeof ytd>();
      for (const entry of ytd) {
        const list = byYear.get(entry.year.fiscalYear) ?? [];
        list.push(entry);
        byYear.set(entry.year.fiscalYear, list);
      }
      for (const [fiscalYear, entries] of byYear) {
        const ordered = entries.slice().sort((a, b) => a.days - b.days);
        for (let i = 0; i < ordered.length; i++) {
          const current = ordered[i];
          if (slots.has(`${fiscalYear}|${current.period}`)) continue;
          const previous = i === 0 ? null : ordered[i - 1];
          const base = previous ? previous.candidate.fact.val : 0;
          put({
            ...rowFrom(item, current.candidate, fiscalYear, current.period, unit),
            value: current.candidate.fact.val - base,
            derived: Boolean(previous),
          });
        }
      }

      // —— Derive Q4 ——
      // A 10-K reports the full year, never a fourth quarter. Q4 is the year
      // minus the three filed quarters. Only attempted when all three are
      // present, because a missing quarter would silently inflate Q4.
      for (const [key, yearRow] of [...slots]) {
        if (!key.endsWith("|FY")) continue;
        const fiscalYear = yearRow.fiscalYear;
        if (slots.has(`${fiscalYear}|Q4`)) continue;
        const q1 = slots.get(`${fiscalYear}|Q1`);
        const q2 = slots.get(`${fiscalYear}|Q2`);
        const q3 = slots.get(`${fiscalYear}|Q3`);
        if (!q1 || !q2 || !q3) continue;
        put({
          ...yearRow,
          fiscalPeriod: "Q4",
          value: yearRow.value - (q1.value + q2.value + q3.value),
          derived: true,
        });
      }
    }

    rows.push(...slots.values());
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

  rows.sort(
    (a, b) =>
      b.fiscalYear - a.fiscalYear ||
      a.fiscalPeriod.localeCompare(b.fiscalPeriod) ||
      a.lineItem.localeCompare(b.lineItem),
  );

  return { rows, filerKind, suppression };
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
