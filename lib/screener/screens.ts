// The starting screens: each a named set of filters, worded as a plain
// description of what it finds, never as a pick, with one line on why
// investors look at that, written as a fact about the measure. All their
// definitions live here. Pure.
//
// From the addendum of 7 November 2026 (docs/phase-eleven/phase-eleven-screens.md),
// grouped under the question each answers. Its thresholds were starting
// points, tuned to round numbers so each screen finds roughly 15 to 150
// companies, against the addendum's first thresholds where they differ.
// Counts from the published run of 9 November 2026, after Eli's review
// (buybacks gained a $500M revenue floor; New England's fell to $100M):
//   High return on capital          ROIC 25%+ (20%), revenue $500M+         107
//   Revenue up ten years in a row   10 years, revenue $2B+ (no floor)        130
//   Strong free cash flow           FCF margin 25%+, revenue $1B+            116
//   Fast growth, already profitable growth 20%+, op. margin 10%+, $200M+    136
//   Rule of 40                      40%+, technology, revenue $200M+         113
//   Margins widening                10+ points (5), revenue $2B+ ($200M)     125
//   Fast growth, still losing money growth 30%+, net loss, $100M+           128
//   Buying back shares              shares down 6%+ (3%), positive FCF, $500M+  88
//   Dividends covered by cash flow  40% of FCF or less (60%), $10B+ ($500M) 130
//   More cash than debt             more cash than debt, positive FCF, $1B+  142
//   Profits without the cash        net profit, conversion 0.5× or less, $200M+  77
//   Issuing shares fast             shares up 30%+ (10%), revenue $100M+     130
//   Based in New England            six states, revenue $100M+ (no floor)   178
//
// Bounds are inclusive, as the filter boxes are ("25% or more"). Where a
// title says "more than", "losing" or "positive", the strict reading and the
// inclusive one pick the same companies: no company's net margin, free cash
// flow margin or net cash is exactly zero (checked 6 and 7 November 2026).
//
// Each has its own page, /screener/{slug}, indexable, with a title and
// description from its name and why line, sorted by its own measure. Stage C's
// six addresses that no longer exist redirect to /screener (next.config.ts).

import { NEW_ENGLAND, sameFilters, type Filters, type Order, type SortKey } from "@/lib/screener/filters";

export const SCREEN_GROUPS = [
  { key: "quality", label: "Quality", question: "Is this a strong business?" },
  { key: "growth", label: "Growth", question: "Is it getting bigger, and does it pay off?" },
  { key: "returns", label: "Shareholder returns", question: "Where does the cash go?" },
  { key: "balance", label: "Balance sheet", question: "Could it ride out a bad year?" },
  { key: "scrutiny", label: "Read closely", question: "Things investors check before trusting the numbers." },
  { key: "home", label: "Close to home", question: "Companies based in one region." },
] as const;

export type ScreenGroup = (typeof SCREEN_GROUPS)[number]["key"];

export type StartingScreen = {
  slug: string;
  group: ScreenGroup;
  title: string;
  // Why investors look at this: a fact about the measure, never advice.
  why: string | null;
  filters: Filters;
  sort: SortKey;
  order: Order;
};

const F = (ranges: Filters["ranges"], extra: Partial<Omit<Filters, "ranges">> = {}): Filters => ({
  ranges,
  sectors: extra.sectors ?? [],
  states: extra.states ?? [],
  dividend: extra.dividend ?? false,
});

export const STARTING_SCREENS: readonly StartingScreen[] = [
  // —— Quality ——
  {
    slug: "high-return-on-capital",
    group: "quality",
    title: "High return on capital",
    why: "Earns a lot on the money tied up in it, so it can grow without needing much more. Many long-term investors start here.",
    filters: F({ revenue: { min: 5e8, max: null }, roic: { min: 25, max: null } }),
    sort: "roic",
    order: "desc",
  },
  {
    slug: "revenue-up-ten-years-in-a-row",
    group: "quality",
    title: "Revenue up ten years in a row",
    why: "Sales grew every year for a decade, through 2020 and everything since.",
    filters: F({ revenue: { min: 2e9, max: null }, years: { min: 10, max: null } }),
    sort: "growth10y",
    order: "desc",
  },
  {
    slug: "strong-free-cash-flow",
    group: "quality",
    title: "Strong free cash flow",
    why: "Keeps a large share of every sale as cash after running and reinvesting in the business.",
    filters: F({ revenue: { min: 1e9, max: null }, fcf: { min: 25, max: null } }),
    sort: "fcf",
    order: "desc",
  },
  // —— Growth ——
  {
    slug: "fast-growth-already-profitable",
    group: "growth",
    title: "Fast growth, already profitable",
    why: "Growing quickly without losing money to do it.",
    filters: F({ revenue: { min: 2e8, max: null }, growth1y: { min: 20, max: null }, operating: { min: 10, max: null } }),
    sort: "growth1y",
    order: "desc",
  },
  {
    slug: "rule-of-40",
    group: "growth",
    title: "Rule of 40",
    why: "A common yardstick for software: growth plus free cash flow margin adds up to 40% or more.",
    filters: F({ revenue: { min: 2e8, max: null }, rule40: { min: 40, max: null } }, { sectors: ["Technology"] }),
    sort: "rule40",
    order: "desc",
  },
  {
    slug: "margins-widening",
    group: "growth",
    title: "Margins widening",
    why: "Each new dollar of sales is earning more than it did three years ago.",
    filters: F({ revenue: { min: 2e9, max: null }, marginchange: { min: 10, max: null } }),
    sort: "marginchange",
    order: "desc",
  },
  {
    slug: "fast-growth-still-losing-money",
    group: "growth",
    title: "Fast growth, still losing money",
    why: "Earlier-stage companies. The question is when, or whether, profit follows.",
    filters: F({ revenue: { min: 1e8, max: null }, growth1y: { min: 30, max: null }, net: { min: null, max: 0 } }),
    sort: "growth1y",
    order: "desc",
  },
  // —— Shareholder returns ——
  {
    slug: "buying-back-shares",
    group: "returns",
    title: "Buying back shares",
    why: "Fewer shares means each remaining one owns more of the company.",
    filters: F({ revenue: { min: 5e8, max: null }, fcf: { min: 0, max: null }, shares: { min: null, max: -6 } }),
    sort: "shares",
    order: "asc",
  },
  {
    slug: "dividends-covered-by-cash-flow",
    group: "returns",
    title: "Dividends covered by cash flow",
    why: "Pays its dividend out of free cash flow with room to spare if a year goes badly.",
    filters: F({ revenue: { min: 1e10, max: null }, divfcf: { min: null, max: 40 } }, { dividend: true }),
    sort: "divfcf",
    order: "asc",
  },
  // —— Balance sheet ——
  {
    slug: "more-cash-than-debt",
    group: "balance",
    title: "More cash than debt",
    why: "Holds more cash and short-term investments than it owes.",
    filters: F({ revenue: { min: 1e9, max: null }, fcf: { min: 0, max: null }, netcash: { min: 0, max: null } }),
    sort: "netcash",
    order: "desc",
  },
  // —— Read closely ——
  {
    slug: "profits-without-the-cash",
    group: "scrutiny",
    title: "Profits without the cash",
    why: "Reported profit isn't turning into cash. Sometimes it's timing, sometimes accounting. Worth knowing which.",
    filters: F({ revenue: { min: 2e8, max: null }, net: { min: 0, max: null }, cashconv: { min: null, max: 0.5 } }),
    sort: "cashconv",
    order: "asc",
  },
  {
    slug: "issuing-shares-fast",
    group: "scrutiny",
    title: "Issuing shares fast",
    why: "New shares split ownership more ways. Investors check what the money paid for.",
    filters: F({ revenue: { min: 1e8, max: null }, shares: { min: 30, max: null } }),
    sort: "shares",
    order: "desc",
  },
  // —— Close to home ——
  {
    slug: "based-in-new-england",
    group: "home",
    title: "Based in New England",
    why: null,
    filters: F({ revenue: { min: 1e8, max: null } }, { states: [...NEW_ENGLAND] }),
    sort: "revenue",
    order: "desc",
  },
];

// Stage C's six screens, retired 7 November 2026; their addresses redirect
// to /screener (next.config.ts). more-cash-than-debt kept its address.
export const RETIRED_SCREENS = [
  "revenue-up-20-cash-flow-positive",
  "share-count-shrinking",
  "gross-margin-above-70",
  "losing-money-revenue-up-30",
  "revenue-falling",
] as const;

export function startingScreen(slug: string): StartingScreen | undefined {
  return STARTING_SCREENS.find((s) => s.slug === slug);
}

// A link whose filters are exactly a starting screen's gets that screen's title.
export function matchingScreen(filters: Filters): StartingScreen | undefined {
  return STARTING_SCREENS.find((s) => sameFilters(s.filters, filters));
}

// The page's meta description: what it finds, then why.
export function screenDescription(s: StartingScreen, sentence: string): string {
  return s.why ? `${sentence} ${s.why}` : sentence;
}
