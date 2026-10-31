// The map from "a line item a person recognises" to "the XBRL tags companies
// actually file it under". Dependency-free on purpose (same reasoning as
// lib/ticker.ts and lib/analysis/chartRanges.ts) so the normaliser, its tests
// and any future UI can all import it without dragging in the fetch layer.
//
// Why a list per line item rather than one tag: companies tag the same figure
// differently, and the same company changes its mind between years. NVIDIA is
// the proof — it filed revenue as RevenueFromContractWithCustomerExcludingAssessedTax
// through fiscal 2022 and as Revenues from fiscal 2023 on, and it reports capex
// under PaymentsToAcquireProductiveAssets while most manufacturers use
// PaymentsToAcquirePropertyPlantAndEquipment. Verified against NVDA's own
// companyfacts, October 2026.
//
// Order is "most specific first". The normaliser takes the first tag that has a
// value for the period being filled, so a tag that stopped being used simply
// falls through to the next one. Never guess: a line item with no matching tag
// for a period is absent, which renders as a blank, not a zero.

export type LineItem =
  | "revenue"
  | "cost_of_revenue"
  | "gross_profit"
  | "operating_income"
  | "net_income"
  | "operating_cash_flow"
  | "capex"
  | "free_cash_flow"
  | "buybacks"
  | "shares_diluted"
  | "cash_and_equivalents"
  | "total_assets"
  | "total_equity";

// Balance-sheet items are instants (a value on one date) and are never summed
// across quarters; everything else is a duration (a value over a span) and is
// what Q4 derivation and year-to-date unwinding apply to.
export const INSTANT_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>([
  "cash_and_equivalents",
  "total_assets",
  "total_equity",
]);

// free_cash_flow is absent here because no company reports it — it is operating
// cash flow minus capex, computed by us, and labelled as ours wherever shown.
export const DERIVED_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>(["free_cash_flow"]);

export const CONCEPT_TAGS: Record<Exclude<LineItem, "free_cash_flow">, readonly string[]> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    // Banks present revenue net of interest expense; JPMorgan files both this
    // and Revenues with the same value (182.45B for 2025), so either resolves.
    "RevenuesNetOfInterestExpense",
  ],
  cost_of_revenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss"],
  net_income: [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
  ],
  operating_cash_flow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    // Verizon files capital expenditure under this one from 2019 on, and under
    // PaymentsToAcquireProductiveAssets before that — found by running the
    // twenty-company check, which reported seven straight years with no capex.
    "PaymentsToAcquireOtherProductiveAssets",
    "PaymentsForCapitalImprovements",
    "PaymentsToAcquireOtherPropertyPlantAndEquipment",
  ],
  // Cash spent repurchasing the company's own shares, from the cash-flow
  // statement. Added in phase nine stage 2 for the Overview's key stats and the
  // "what stands out" buyback rule. A cash-flow line, so 10-Q values are
  // year-to-date and get unwound like operating cash flow.
  buybacks: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
  shares_diluted: [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfDilutedSharesOutstandingAdjusted",
  ],
  cash_and_equivalents: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  total_assets: ["Assets"],
  total_equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
};

// Shares are filed in the "shares" unit, everything else in USD.
export function unitFor(item: LineItem): "USD" | "shares" {
  return item === "shares_diluted" ? "shares" : "USD";
}

// —— Business models where a line item is meaningless, not merely missing ——
// A bank funds itself with deposits, so "capital expenditure" and therefore
// free cash flow describe nothing about it, and its operating cash flow swings
// negative on balance-sheet movements (JPMorgan: -147.8B for 2025) — a number
// that would read as alarming and mean nothing. It has no cost of revenue
// either, so gross margin cannot exist. Detected by SIC code from the
// submissions file rather than guessed from the tags, so a blank is a stated
// "not applicable" instead of a silent gap.
//
// SIC ranges: 6000–6499 banks, credit and insurance; 6500–6599 real estate;
// 6798 REITs. Deliberately a judgement about what to SHOW, never about quality.
export type FilerKind = "operating" | "financial" | "reit";

export function filerKindFromSic(sic: string | number | null | undefined): FilerKind {
  const n = typeof sic === "string" ? parseInt(sic, 10) : sic;
  if (n == null || Number.isNaN(n)) return "operating";
  if (n === 6798) return "reit";
  if (n >= 6000 && n <= 6599) return "financial";
  return "operating";
}

// Which line items to suppress, with the reason shown to the reader. The brief's
// rule: "A blank is fine; a wrong number is not."
export function suppressedItems(kind: FilerKind): { items: LineItem[]; reason: string } | null {
  if (kind === "financial") {
    return {
      items: ["gross_profit", "cost_of_revenue", "capex", "free_cash_flow"],
      reason:
        "Banks and insurers fund themselves with deposits and float rather than selling goods, so gross margin and free cash flow don't describe this business. They aren't shown.",
    };
  }
  if (kind === "reit") {
    return {
      items: ["gross_profit", "cost_of_revenue"],
      reason:
        "REITs report property operating costs rather than a cost of goods sold, so gross margin doesn't describe this business. It isn't shown.",
    };
  }
  return null;
}
