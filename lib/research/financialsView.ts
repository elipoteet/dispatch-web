// The Financials tab's table and chart, shaped once on the server. Pure, so
// every row and marker is unit-tested; the client component only switches
// between views.

import type { FilerKind, LineItem } from "@/lib/sec/concepts";
import type { FinancialRow } from "@/lib/sec/normalize";
import { FinancialSeries, quarterIndex, type QuarterKey } from "@/lib/research/series";
import { formatMoney, formatPct, fyShort, isCalendarYear } from "@/lib/research/format";

export type CellMark = "restated" | "filing";

export type Cell = {
  value: number | null;
  display: string;
  negative?: boolean;
  // restated: a later filing changed this figure. filing: capex read from the
  // company's own cash-flow statement because the SEC's summary data lacked it.
  marks?: CellMark[];
};

export type RowKind = "money" | "percent" | "growth" | "shares";

export type TableRow = {
  id: string;
  label: string;
  kind: RowKind;
  emphasis?: boolean;
  section?: string;
  cells: Cell[];
};

export type MetricSeries = {
  id: string;
  label: string;
  kind: "money" | "percent";
  values: (number | null)[];
  summary: string;
};

export type PeriodView = {
  columns: { key: string; label: string }[];
  unitLabel: string;
  rows: TableRow[];
  metrics: MetricSeries[];
};

export type FinancialsView = {
  annual: PeriodView | null;
  quarterly: PeriodView | null;
};

const ANNUAL_COLUMNS = 10;
const QUARTER_COLUMNS = 12;

type Period = { key: string; label: string; get: (s: FinancialSeries, item: LineItem) => FinancialRow | null };

// Money columns read in billions for anything big enough, millions otherwise,
// decided once per table from the largest revenue figure in it.
function unitFor(values: number[]): { divisor: number; label: string } {
  const max = Math.max(0, ...values.map(Math.abs));
  return max >= 1e9 ? { divisor: 1e9, label: "$ billions" } : { divisor: 1e6, label: "$ millions" };
}

// One number format per row, set by its largest figure, so a row never
// switches mid-way (review of 2 November 2026: "147 94.69 162"). Two decimals
// below 100, one from 100, whole numbers from 1,000 with separators: a bank's
// balance sheet runs to "4,425" billion.
function rowDecimals(values: number[], divisor: number): number {
  const max = Math.max(0, ...values.map((v) => Math.abs(v / divisor)));
  return max >= 1000 ? 0 : max >= 100 ? 1 : 2;
}

function moneyDisplay(value: number, divisor: number, decimals: number): string {
  const v = value / divisor;
  const text = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return v < 0 ? `-${text}` : text;
}

function marksOf(row: FinancialRow | null): CellMark[] | undefined {
  if (!row) return undefined;
  const marks: CellMark[] = [];
  if (row.restated) marks.push("restated");
  if (row.source === "finnhub") marks.push("filing");
  return marks.length ? marks : undefined;
}

const MONEY_ROWS: { item: LineItem; label: string; section: string; emphasis?: boolean }[] = [
  { item: "revenue", label: "Revenue", section: "Income", emphasis: true },
  { item: "operating_income", label: "Operating income", section: "Income" },
  { item: "net_income", label: "Net income", section: "Income", emphasis: true },
  { item: "operating_cash_flow", label: "Operating cash flow", section: "Cash flow" },
  { item: "capex", label: "Capital expenditure", section: "Cash flow" },
  { item: "free_cash_flow", label: "Free cash flow (calculated)", section: "Cash flow", emphasis: true },
  { item: "buybacks", label: "Share repurchases", section: "Cash flow" },
  { item: "cash_and_equivalents", label: "Cash and equivalents", section: "Balance sheet" },
  { item: "total_assets", label: "Total assets", section: "Balance sheet" },
  { item: "total_equity", label: "Total equity", section: "Balance sheet" },
];

function buildView(
  s: FinancialSeries,
  periods: Period[],
  previous: (index: number) => Period | null,
  options: { suppressed: Set<LineItem>; filerKind: FilerKind; growthLabel: string; spanLabel: string },
): PeriodView | null {
  if (periods.length === 0) return null;
  const revenueValues = periods.map((p) => p.get(s, "revenue")?.value).filter((v): v is number => v != null);
  const unit = unitFor(revenueValues.length ? revenueValues : periods.map((p) => p.get(s, "net_income")?.value ?? 0));

  const moneyRow = (item: LineItem, label: string, section: string, emphasis?: boolean): TableRow | null => {
    if (options.suppressed.has(item)) return null;
    const found = periods.map((p) => p.get(s, item));
    const decimals = rowDecimals(found.filter((r): r is FinancialRow => r != null).map((r) => r.value), unit.divisor);
    const cells = found.map((row): Cell => {
      if (!row) return { value: null, display: "—" };
      return { value: row.value, display: moneyDisplay(row.value, unit.divisor, decimals), negative: row.value < 0, marks: marksOf(row) };
    });
    if (cells.every((c) => c.value == null)) return null;
    return { id: item, label, kind: "money", section, emphasis, cells };
  };

  const ratioRow = (id: string, label: string, section: string, num: LineItem | "gross", den: LineItem = "revenue"): TableRow | null => {
    const cells = periods.map((p): Cell => {
      const denominator = p.get(s, den)?.value;
      let numerator: number | null | undefined;
      if (num === "gross") {
        numerator = p.get(s, "gross_profit")?.value;
        if (numerator == null) {
          const cost = p.get(s, "cost_of_revenue")?.value;
          numerator = cost != null && denominator != null ? denominator - cost : null;
        }
      } else {
        numerator = p.get(s, num)?.value;
      }
      if (numerator == null || !denominator || denominator <= 0) return { value: null, display: "—" };
      const pct = (numerator / denominator) * 100;
      return { value: pct, display: formatPct(pct), negative: pct < 0 };
    });
    if (cells.every((c) => c.value == null)) return null;
    return { id, label, kind: "percent", section, cells };
  };

  const growthRow: TableRow = {
    id: "revenue-growth",
    label: options.growthLabel,
    kind: "growth",
    section: "Income",
    cells: periods.map((p, i): Cell => {
      const now = p.get(s, "revenue")?.value;
      const prev = previous(i)?.get(s, "revenue")?.value;
      if (now == null || prev == null || prev <= 0) return { value: null, display: "—" };
      const g = ((now - prev) / prev) * 100;
      const rounded = Math.round(g);
      return { value: g, display: `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}%`, negative: g < 0 };
    }),
  };

  // No share-count row yet: the SEC's counts are as filed, not adjusted for
  // stock splits (NVIDIA's runs 2,535M then 25,070M across its 2024 split), so
  // a ten-year row of them would mislead. It returns once splits are adjusted.

  const grossMarginRow =
    options.filerKind === "operating" && !options.suppressed.has("gross_profit")
      ? ratioRow("gross-margin", "Gross margin", "Income", "gross")
      : null;

  const ordered: (TableRow | null)[] = [
    moneyRow("revenue", "Revenue", "Income", true),
    growthRow.cells.some((c) => c.value != null) ? growthRow : null,
    grossMarginRow,
    moneyRow("operating_income", "Operating income", "Income"),
    ratioRow("operating-margin", "Operating margin", "Income", "operating_income"),
    moneyRow("net_income", "Net income", "Income", true),
    ratioRow("net-margin", "Net margin", "Income", "net_income"),
    ...MONEY_ROWS.filter((r) => r.section !== "Income").map((r) => moneyRow(r.item, r.label, r.section, r.emphasis)),
  ];
  const rows = ordered.filter((r): r is TableRow => r != null);

  // The chart's chips: the headline figures, plus whichever margin applies.
  const metricFrom = (row: TableRow | undefined, id: string, label: string): MetricSeries | null => {
    if (!row) return null;
    const values = row.cells.map((c) => c.value);
    return { id, label, kind: row.kind === "percent" ? "percent" : "money", values, summary: summarize(values, row.kind === "percent", periods, options.spanLabel) };
  };
  const byId = (id: string) => rows.find((r) => r.id === id);
  const metrics = [
    metricFrom(byId("revenue"), "revenue", "Revenue"),
    metricFrom(byId("net_income"), "net_income", "Net income"),
    metricFrom(byId("free_cash_flow"), "free_cash_flow", "Free cash flow"),
    grossMarginRow ? metricFrom(grossMarginRow, "gross-margin", "Gross margin") : metricFrom(byId("net-margin"), "net-margin", "Net margin"),
  ].filter((m): m is MetricSeries => m != null && m.values.some((v) => v != null));

  return { columns: periods.map((p) => ({ key: p.key, label: p.label })), unitLabel: unit.label, rows, metrics };
}

// One line above the chart, stating the change across what's shown.
function summarize(values: (number | null)[], isPercent: boolean, periods: Period[], spanLabel: string): string {
  const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
  if (present.length < 2) return "";
  const first = present[0];
  const last = present[present.length - 1];
  if (isPercent) {
    const max = present.reduce((a, b) => (b.v > a.v ? b : a));
    const min = present.reduce((a, b) => (b.v < a.v ? b : a));
    return `High ${formatPct(max.v)} (${periods[max.i].label}) · low ${formatPct(min.v)} (${periods[min.i].label})`;
  }
  // A multiple means nothing across a loss, so state the two ends instead.
  if (first.v <= 0 || last.v <= 0) {
    return `${formatMoney(first.v)} in ${periods[first.i].label}, ${formatMoney(last.v)} in ${periods[last.i].label}`;
  }
  const ratio = last.v / first.v;
  const span = `${periods[first.i].label}–${periods[last.i].label}`;
  if (ratio >= 2) return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x ${spanLabel} (${span})`;
  const change = Math.round((ratio - 1) * 100);
  return `${change >= 0 ? "+" : ""}${change}% ${spanLabel} (${span})`;
}

export function buildFinancialsView(input: {
  rows: FinancialRow[];
  filerKind: FilerKind;
  suppressed: LineItem[];
  fiscalYearEnd: string | null;
}): FinancialsView {
  const s = new FinancialSeries(input.rows);
  const suppressed = new Set(input.suppressed);
  const calendar = isCalendarYear(input.fiscalYearEnd);

  // —— Annual: the last ten fiscal years with any full-year figure ——
  const years = [...new Set(input.rows.filter((r) => r.fiscalPeriod === "FY").map((r) => r.fiscalYear))]
    .sort((a, b) => a - b)
    .slice(-ANNUAL_COLUMNS);
  const yearPeriod = (fy: number): Period => ({
    key: String(fy),
    label: calendar ? String(fy) : fyShort(fy),
    get: (series, item) => series.row(item, fy, "FY"),
  });
  const annualPeriods = years.map(yearPeriod);
  const annual = buildView(s, annualPeriods, (i) => yearPeriod(years[i] - 1), {
    suppressed,
    filerKind: input.filerKind,
    growthLabel: "Revenue growth",
    spanLabel: "over the years shown",
  });

  // —— Quarterly: the last twelve quarters with any figure ——
  const quarterIndexes = [
    ...new Set(
      input.rows
        .filter((r) => r.fiscalPeriod !== "FY")
        .map((r) => quarterIndex({ fiscalYear: r.fiscalYear, quarter: r.fiscalPeriod as QuarterKey["quarter"] })),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(-QUARTER_COLUMNS);
  const quarterPeriod = (index: number): Period => {
    const q: QuarterKey = { fiscalYear: Math.floor(index / 4), quarter: (["Q1", "Q2", "Q3", "Q4"] as const)[index % 4] };
    return {
      key: `${q.fiscalYear}-${q.quarter}`,
      label: `${q.quarter} ${calendar ? q.fiscalYear : fyShort(q.fiscalYear)}`,
      get: (series, item) => series.row(item, q.fiscalYear, q.quarter),
    };
  };
  const quarterly = buildView(
    s,
    quarterIndexes.map(quarterPeriod),
    // Growth against the same quarter a year earlier, so seasonality cancels.
    (i) => quarterPeriod(quarterIndexes[i] - 4),
    { suppressed, filerKind: input.filerKind, growthLabel: "Revenue growth vs a year earlier", spanLabel: "over the quarters shown" },
  );

  return { annual, quarterly };
}
