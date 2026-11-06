// Which SEC frames files the screener needs, and how to read one. Pure.
//
// A frame is one XBRL tag for one calendar period across every company
// (client.ts, fetchFrame). The screener asks for one frame per tag in each line
// item's fallback list, per period, then picks each company's tag the way the
// normaliser does (lib/screener/assemble.ts).
//
// How the SEC assigns periods (frames documentation, checked against real files
// 5 November 2026): an annual frame ("CY2025") holds each company's year of
// about 365 days that falls mostly in that calendar year, so NVIDIA's fiscal
// 2026 (27 January 2025 to 25 January 2026) is in CY2025, and Apple's year to
// September 2026 is already in CY2026. An instant frame ("CY2025Q4I") holds
// each company's balance-sheet date nearest that quarter's end. Each company
// appears at most once per frame, with the most recently filed value.

import {
  CONCEPT_TAGS,
  INSTANT_ITEMS,
  SCREENER_CONCEPT_TAGS,
  SCREENER_INSTANT_ITEMS,
  unitFor,
  type LineItem,
  type ScreenerLineItem,
  type TaggedLineItem,
} from "@/lib/sec/concepts";
import { CASH_WITH_RESTRICTED, RESTRICTED_CASH_TAGS } from "@/lib/sec/normalize";

export type FrameUnit = "USD" | "shares" | "USD-per-shares";

// One company's row in a frame, exactly as the SEC serves it. `start` is
// present on durations only. `loc` is "US-CA", a foreign code, or "-".
export type FrameEntry = {
  accn: string;
  cik: number;
  entityName: string;
  loc: string;
  start?: string;
  end: string;
  val: number;
};

export type FrameResponse = {
  taxonomy: string;
  tag: string;
  ccp: string;
  uom: string;
  label: string;
  description: string;
  pts: number;
  data: FrameEntry[];
};

// What the screener keeps from a row: the number, its period, and the filing
// it came from (for tracing a surprising figure, and for the split guard).
export type FrameValue = { val: number; start: string | null; end: string; accn: string };

// —— The inputs ——
// Every line item the screener reads, with its tags in fallback order. The
// existing items reuse CONCEPT_TAGS as they are; the screener-only ones come
// from SCREENER_CONCEPT_TAGS; the restricted-cash tags are the normaliser's own
// (cash worked out from the restricted-cash total, normalize.ts).
export type InputItem = TaggedLineItem | ScreenerLineItem | "cash_with_restricted" | "restricted_cash_current" | "restricted_cash_noncurrent";

export type InputSpec = {
  item: InputItem;
  tags: readonly string[];
  unit: FrameUnit;
  kind: "duration" | "instant";
  // "long": ten years of history (revenue, for multi-year growth and "years in
  // a row"). "short": the latest year and the one before.
  history: "long" | "short";
};

function frameUnit(item: LineItem): FrameUnit {
  const unit = unitFor(item);
  return unit === "USD/shares" ? "USD-per-shares" : unit;
}

export const SCREENER_INPUTS: readonly InputSpec[] = [
  ...(Object.keys(CONCEPT_TAGS) as TaggedLineItem[]).map(
    (item): InputSpec => ({
      item,
      tags: CONCEPT_TAGS[item],
      unit: frameUnit(item),
      kind: INSTANT_ITEMS.has(item) ? "instant" : "duration",
      history: item === "revenue" ? "long" : "short",
    }),
  ),
  ...(Object.keys(SCREENER_CONCEPT_TAGS) as ScreenerLineItem[]).map(
    (item): InputSpec => ({
      item,
      tags: SCREENER_CONCEPT_TAGS[item],
      unit: "USD",
      kind: SCREENER_INSTANT_ITEMS.has(item) ? "instant" : "duration",
      history: "short",
    }),
  ),
  { item: "cash_with_restricted", tags: [CASH_WITH_RESTRICTED], unit: "USD", kind: "instant", history: "short" },
  { item: "restricted_cash_current", tags: RESTRICTED_CASH_TAGS[0], unit: "USD", kind: "instant", history: "short" },
  { item: "restricted_cash_noncurrent", tags: RESTRICTED_CASH_TAGS[1], unit: "USD", kind: "instant", history: "short" },
];

// —— Periods ——
const DAY_MS = 86_400_000;

// A company stays in the screener while its latest annual report covers a year
// that ended within the last 18 months (the brief).
export const MAX_REPORT_AGE_MONTHS = 18;

export function reportCutoff(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - MAX_REPORT_AGE_MONTHS);
  return d.toISOString().slice(0, 10);
}

export function durationPeriod(year: number): string {
  return `CY${year}`;
}

export function instantPeriod(year: number, quarter: 1 | 2 | 3 | 4): string {
  return `CY${year}Q${quarter}I`;
}

const QUARTER_ENDS = ["03-31", "06-30", "09-30", "12-31"] as const;

// Quarter ends whose instant frame could hold a balance-sheet date between
// `from` and `to`. A date lands in the frame of its nearest quarter end, never
// more than 46 days away, so the window is widened by that much each side.
export function instantPeriodsBetween(from: string, to: string): string[] {
  const lo = new Date(Date.parse(from) - 46 * DAY_MS).toISOString().slice(0, 10);
  const hi = new Date(Date.parse(to) + 46 * DAY_MS).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let year = Number(lo.slice(0, 4)); year <= Number(hi.slice(0, 4)); year++) {
    QUARTER_ENDS.forEach((md, i) => {
      const end = `${year}-${md}`;
      if (end >= lo && end <= hi) out.push(instantPeriod(year, (i + 1) as 1 | 2 | 3 | 4));
    });
  }
  return out;
}

export type FrameRequest = { item: InputItem; tag: string; unit: FrameUnit; period: string };

export type RefreshMode = "full" | "nightly";

// Every file a refresh asks for.
//
// The oldest "latest year" the screener can hold is the one that ended 18
// months ago. A year ending in May 2025 runs mostly through 2024, so it sits in
// CY2024: with today in 2026, latest years live in CY2024 to CY2026. Short
// history then needs one year more (CY2023 to CY2026); long history needs ten
// more (CY2014 to CY2026) for ten-year growth and "years in a row".
//
// "nightly" is what a new filing can change from one day to the next: the
// current and previous calendar years, and the three newest quarter ends.
//
// A tag that serves two line items (the cash total including restricted cash
// is both cash's last fallback and the base of the restricted-cash
// calculation) is fetched once.
export function framePlan(today: string, mode: RefreshMode): FrameRequest[] {
  const year = Number(today.slice(0, 4));
  const cutoff = reportCutoff(today);
  const instants = instantPeriodsBetween(cutoff, today);
  const out: FrameRequest[] = [];
  const seen = new Set<string>();
  for (const spec of SCREENER_INPUTS) {
    let periods: string[];
    if (spec.kind === "instant") {
      periods = mode === "full" ? instants : instants.slice(-3);
    } else {
      const first = mode === "nightly" ? year - 1 : spec.history === "long" ? year - 12 : year - 3;
      periods = [];
      for (let y = first; y <= year; y++) periods.push(durationPeriod(y));
    }
    for (const tag of spec.tags) {
      for (const period of periods) {
        const key = `${tag}|${spec.unit}|${period}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ item: spec.item, tag, unit: spec.unit, period });
      }
    }
  }
  return out;
}

// —— Reading a frame ——
// Reduces a file of several hundred kilobytes to one small value per company,
// keyed by CIK as a number. The raw response can be dropped straight after.
export function indexFrame(frame: FrameResponse): Map<number, FrameValue> {
  const out = new Map<number, FrameValue>();
  for (const row of frame.data ?? []) {
    if (typeof row?.val !== "number" || !Number.isFinite(row.val) || !row.end) continue;
    out.set(row.cik, { val: row.val, start: row.start ?? null, end: row.end, accn: row.accn });
  }
  return out;
}
