// Reading the stored SEC rows by year and by quarter. Pure.
//
// Imports only types from lib/sec, so client components can use it too.

import type { FinancialRow, FiscalPeriod } from "@/lib/sec/normalize";
import { INSTANT_ITEMS, type LineItem } from "@/lib/sec/concepts";

export type QuarterKey = { fiscalYear: number; quarter: Exclude<FiscalPeriod, "FY"> };

const QUARTERS: Exclude<FiscalPeriod, "FY">[] = ["Q1", "Q2", "Q3", "Q4"];

export function quarterIndex(q: QuarterKey): number {
  return q.fiscalYear * 4 + QUARTERS.indexOf(q.quarter);
}

export function quarterFromIndex(index: number): QuarterKey {
  return { fiscalYear: Math.floor(index / 4), quarter: QUARTERS[index % 4] };
}

// Every row in one place, looked up by line item and period.
export class FinancialSeries {
  private readonly byKey = new Map<string, FinancialRow>();

  constructor(readonly rows: FinancialRow[]) {
    for (const r of rows) this.byKey.set(`${r.lineItem}|${r.fiscalYear}|${r.fiscalPeriod}`, r);
  }

  row(item: LineItem, fiscalYear: number, period: FiscalPeriod): FinancialRow | null {
    const exact = this.byKey.get(`${item}|${fiscalYear}|${period}`);
    if (exact) return exact;
    // Balance-sheet items are a snapshot on one date, so the normaliser files
    // the year-end figure under Q4 and never under FY. For these, "the year's
    // figure" is that year-end snapshot.
    if (period === "FY" && INSTANT_ITEMS.has(item)) return this.byKey.get(`${item}|${fiscalYear}|Q4`) ?? null;
    return null;
  }

  annual(item: LineItem, fiscalYear: number): number | null {
    return this.row(item, fiscalYear, "FY")?.value ?? null;
  }

  quarterly(item: LineItem, q: QuarterKey): number | null {
    return this.row(item, q.fiscalYear, q.quarter)?.value ?? null;
  }

  // Fiscal years with a full-year figure for this item, oldest first.
  annualYears(item: LineItem): number[] {
    const years = this.rows.filter((r) => r.lineItem === item && r.fiscalPeriod === "FY").map((r) => r.fiscalYear);
    return [...new Set(years)].sort((a, b) => a - b);
  }

  // Quarters with a figure for this item, oldest first.
  quarters(item: LineItem): QuarterKey[] {
    const indexes = this.rows
      .filter((r) => r.lineItem === item && r.fiscalPeriod !== "FY")
      .map((r) => quarterIndex({ fiscalYear: r.fiscalYear, quarter: r.fiscalPeriod as QuarterKey["quarter"] }));
    return [...new Set(indexes)].sort((a, b) => a - b).map(quarterFromIndex);
  }

  // The newest fiscal year with a reported annual revenue figure, or failing
  // that, a net income figure. Everything "latest" on the Overview keys off it.
  latestFiscalYear(): number | null {
    const revenueYears = this.annualYears("revenue");
    if (revenueYears.length) return revenueYears[revenueYears.length - 1];
    const incomeYears = this.annualYears("net_income");
    return incomeYears.length ? incomeYears[incomeYears.length - 1] : null;
  }

  // The last four consecutive quarters, summed: "trailing twelve months".
  // Null unless the four most recent quarters are all present and back to back
  // — a gap would quietly make it eleven or fifteen months.
  trailingTwelveMonths(item: LineItem): { value: number; through: QuarterKey } | null {
    const qs = this.quarters(item);
    if (qs.length < 4) return null;
    const last4 = qs.slice(-4);
    const first = quarterIndex(last4[0]);
    if (last4.some((q, i) => quarterIndex(q) !== first + i)) return null;
    const values = last4.map((q) => this.quarterly(item, q));
    if (values.some((v) => v == null)) return null;
    return { value: (values as number[]).reduce((a, b) => a + b, 0), through: last4[3] };
  }

  // Gross margin as a fraction: gross profit over revenue, or revenue less cost
  // of revenue where a company files those two but no gross profit line.
  grossMargin(fiscalYear: number): number | null {
    const revenue = this.annual("revenue", fiscalYear);
    if (!revenue || revenue <= 0) return null;
    const gross = this.annual("gross_profit", fiscalYear);
    if (gross != null) return gross / revenue;
    const cost = this.annual("cost_of_revenue", fiscalYear);
    return cost != null ? (revenue - cost) / revenue : null;
  }

  margin(item: LineItem, fiscalYear: number): number | null {
    const revenue = this.annual("revenue", fiscalYear);
    const value = this.annual(item, fiscalYear);
    if (!revenue || revenue <= 0 || value == null) return null;
    return value / revenue;
  }
}
