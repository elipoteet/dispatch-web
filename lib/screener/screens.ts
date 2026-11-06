// The starting screens: each a named set of filters, worded as a plain
// description of what it filters for, never as a pick. All their definitions
// live here. Pure.
//
// Each has its own page, /screener/{slug}, indexable with its own title and
// description; the page's count is live. "Revenue falling" is among them on
// purpose: the screener describes, it doesn't select.
//
// Bounds are inclusive, as the filter boxes are ("20% or more"). Where a
// title says "more than" or "losing" the strict reading and the inclusive one
// pick the same companies today: no company's net cash, net margin or free
// cash flow margin is exactly zero (checked 6 November 2026).
//
// Stage D adds the three that use "More filters": pays a dividend with more
// cash than debt, revenue up ten years in a row, and based in New England.

import { sameFilters, type Filters } from "@/lib/screener/filters";

export type StartingScreen = {
  slug: string;
  title: string;
  // The page's meta description, and the line under its title.
  description: string;
  filters: Filters;
};

export const STARTING_SCREENS: readonly StartingScreen[] = [
  {
    slug: "revenue-up-20-cash-flow-positive",
    title: "Revenue up 20% or more, cash flow positive",
    description:
      "U.S.-listed companies whose revenue grew 20% or more in their latest fiscal year and whose free cash flow was positive, from their SEC filings.",
    filters: { ranges: { growth1y: { min: 20, max: null }, fcf: { min: 0, max: null } }, sectors: [] },
  },
  {
    slug: "share-count-shrinking",
    title: "Share count shrinking, down 2% or more",
    description:
      "U.S.-listed companies whose share count fell 2% or more over their latest fiscal year, usually through buybacks, from their SEC filings.",
    filters: { ranges: { shares: { min: null, max: -2 } }, sectors: [] },
  },
  {
    slug: "more-cash-than-debt",
    title: "More cash than debt, revenue over $1B",
    description:
      "U.S.-listed companies with more cash than debt and revenue of $1 billion or more in their latest fiscal year, from their SEC filings.",
    filters: { ranges: { revenue: { min: 1e9, max: null }, netcash: { min: 0, max: null } }, sectors: [] },
  },
  {
    slug: "gross-margin-above-70",
    title: "Gross margin above 70%, revenue over $100M",
    description:
      "U.S.-listed companies with a gross margin of 70% or more and revenue of $100 million or more in their latest fiscal year, from their SEC filings.",
    filters: { ranges: { revenue: { min: 1e8, max: null }, gross: { min: 70, max: null } }, sectors: [] },
  },
  {
    slug: "losing-money-revenue-up-30",
    title: "Losing money, revenue up 30% or more",
    description:
      "U.S.-listed companies that lost money in their latest fiscal year while growing revenue 30% or more, from their SEC filings.",
    filters: { ranges: { growth1y: { min: 30, max: null }, net: { min: null, max: 0 } }, sectors: [] },
  },
  {
    slug: "revenue-falling",
    title: "Revenue falling, down 10% or more",
    description: "U.S.-listed companies whose revenue fell 10% or more in their latest fiscal year, from their SEC filings.",
    filters: { ranges: { growth1y: { min: null, max: -10 } }, sectors: [] },
  },
];

export function startingScreen(slug: string): StartingScreen | undefined {
  return STARTING_SCREENS.find((s) => s.slug === slug);
}

// A link whose filters are exactly a starting screen's gets that screen's title.
export function matchingScreen(filters: Filters): StartingScreen | undefined {
  return STARTING_SCREENS.find((s) => sameFilters(s.filters, filters));
}
