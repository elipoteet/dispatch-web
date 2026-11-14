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
  | "total_equity"
  | "total_debt"
  | "shares_outstanding"
  | "eps_diluted";

// Balance-sheet items are instants (a value on one date) and are never summed
// across quarters; everything else is a duration (a value over a span) and is
// what Q4 derivation and year-to-date unwinding apply to.
export const INSTANT_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>([
  "cash_and_equivalents",
  "total_assets",
  "total_equity",
  "total_debt",
  "shares_outstanding",
]);

// Durations that are averages, not totals, so they can't be added or
// subtracted. A weighted-average share count for the year is not the sum of its
// quarters' counts: deriving NVIDIA's Q4 by subtraction gave about minus 49
// billion shares. These keep the full year and any genuinely filed quarter,
// and skip Q4 derivation and year-to-date unwinding. Found in stage 4.
//
// Earnings per share too, for a second reason: a stock split. Each filing
// states EPS in the shares of its own date, so a fourth quarter worked out as
// the year (from a 10-K after NVIDIA's 2024 split) less a first quarter (from
// a 10-Q before it) mixes share sizes, and came out at -$0.25 where NVIDIA
// earned $0.49. The Earnings tab derives Q4 itself, after putting every figure
// on today's share basis (lib/research/earnings.ts).
export const NON_ADDITIVE_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>(["shares_diluted", "eps_diluted"]);

// free_cash_flow is absent here because no company reports it — it is operating
// cash flow minus capex, computed by us, and labelled as ours wherever shown.
export const DERIVED_ITEMS: ReadonlySet<LineItem> = new Set<LineItem>(["free_cash_flow"]);

// Line items that don't come from the us-gaap tag lists below: free cash flow
// is calculated, and shares outstanding is read from the filing's cover page
// (the dei taxonomy) by extractCoverShares in normalize.ts.
export type TaggedLineItem = Exclude<LineItem, "free_cash_flow" | "shares_outstanding">;

export const CONCEPT_TAGS: Record<TaggedLineItem, readonly string[]> = {
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
  // Borrowings, for enterprise value (Stage 4) and net debt (Stage 8).
  // LongTermDebt includes the current portion where it's filed (NVIDIA, Apple,
  // JPMorgan all file it); the fallbacks are what Alphabet files instead.
  // LongTermDebtNoncurrent comes last because it leaves out debt due within a
  // year, so it understates slightly. Checked against companyfacts, November 2026.
  //
  // Phase eleven, Stage B: two more tags that mean total debt, current part
  // included. GM files its whole debt, GM Financial's included ($131.6B at
  // the end of 2025), only as ...IncludingCurrentMaturities; Air Products,
  // CNH, Dick's, Hertz and LKQ use one or the other. Across all filers' 2025
  // and 2026 year-ends they gave a debt figure to 17 more companies (5
  // November 2026). Tags for one slice of debt (convertible notes, notes
  // payable) were measured and left out: taking a slice as the total would
  // understate it. Ford files no total at all, only Ford and Ford Credit
  // separately, which the SEC's data services leave out; Deere tags its
  // long-term borrowings with its own element. Both stay blank.
  total_debt: [
    "LongTermDebt",
    "DebtLongtermAndShorttermCombinedAmount",
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "DebtAndCapitalLeaseObligations",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtNoncurrent",
  ],
  // Diluted earnings per share as reported (GAAP), for the Earnings tab
  // (Stage 5). Filed in "USD/shares". Only filed figures are stored: no Q4,
  // which a 10-K doesn't report (see NON_ADDITIVE_ITEMS for why).
  eps_diluted: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
};

// Shares are filed in the "shares" unit, earnings per share in "USD/shares",
// everything else in USD.
export function unitFor(item: LineItem): "USD" | "shares" | "USD/shares" {
  if (item === "shares_diluted" || item === "shares_outstanding") return "shares";
  return item === "eps_diluted" ? "USD/shares" : "USD";
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

// —— Line items only the screener reads (phase eleven) ——
// Kept out of CONCEPT_TAGS on purpose. normalizeCompanyFacts walks every list
// in CONCEPT_TAGS three times (to build the fiscal calendar, to find the year
// in progress, and to fill rows), so a new list there could move a company
// page's numbers and would need a NORMALIZER_VERSION bump. These lists feed
// only the screener's frames job (lib/sec/frames.ts), so the research file is
// untouched. Same rules as above: most specific first, a missing tag is a
// blank, never a zero.
export type ScreenerLineItem =
  | "rnd"
  | "sga"
  | "selling_marketing"
  | "general_admin"
  | "interest_expense"
  | "dividends_paid"
  | "current_assets"
  | "current_liabilities"
  // Net cash, both sides (7 November 2026): cash plus short-term
  // investments, and debt plus short-term borrowings and commercial paper.
  | "cash_and_short_term_investments"
  | "short_term_investments"
  | "debt_current"
  | "long_term_debt_current"
  | "short_term_borrowings"
  | "long_term_debt_noncurrent"
  // Return on invested capital's tax rate.
  | "income_tax"
  | "pretax_income"
  // Write-downs, for telling a gross margin's gap from a one-off loss.
  | "impairment"
  // Money held for customers (9 November 2026): funds held for payroll
  // clients or customers, settlement balances, and restricted cash. Read only
  // to tell a payments, payroll or fintech company, whose cash flow and cash
  // include its customers' money (lib/screener/customerMoney.ts).
  | "customer_funds"
  | "settlement_balances"
  | "restricted_cash"
  // Securities a company holds, of any maturity, and the long-term part:
  // where the two leave securities the cash side hasn't counted, the balance
  // sheet itself is read (lib/sec/statementPage.ts).
  | "securities_total"
  | "securities_noncurrent";

export const SCREENER_INSTANT_ITEMS: ReadonlySet<ScreenerLineItem> = new Set<ScreenerLineItem>([
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
  "securities_total",
  "securities_noncurrent",
]);

// Every list below was checked against the latest 10-K in the companyfacts of
// the twenty companies in lib/sec/twentyCompanies.test.ts, plus McDonald's,
// Realty Income and Rivian, and against the CY2025 frames for all filers
// (5 November 2026).
export const SCREENER_CONCEPT_TAGS: Record<ScreenerLineItem, readonly string[]> = {
  // The narrower tag first. Johnson & Johnson files its income-statement R&D
  // ($17.2B for 2024) as ...ExcludingAcquiredInProcessCost and a $1.8B
  // component under the plain tag; Eli Lilly files only the narrower one.
  // Only 18 filers used both in CY2025.
  rnd: [
    "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    "ResearchAndDevelopmentExpense",
    "ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost",
  ],
  sga: ["SellingGeneralAndAdministrativeExpense"],
  // Microsoft, Meta and Alphabet report the two halves of SG&A on separate
  // lines and file no combined tag. The screener adds them only when both are
  // filed for the same year, and labels the result as calculated. Amazon files
  // only general and administrative, so its SG&A share is n/a, not a guess.
  // MarketingExpense added 7 November 2026: Tripadvisor ($791M) and Amazon
  // ($47.1B) file their selling costs as marketing, alongside general and
  // administrative.
  selling_marketing: ["SellingAndMarketingExpense", "MarketingExpense"],
  general_admin: ["GeneralAndAdministrativeExpense"],
  // Most large companies moved to InterestExpenseNonoperating with the 2024
  // taxonomy (NVIDIA, Microsoft, Alphabet, Tesla, Verizon). Costco, Coca-Cola,
  // McDonald's, UnitedHealth and ExxonMobil still file InterestExpense;
  // Chevron, Walmart and Meta file InterestExpenseDebt (Meta also files
  // Nonoperating, $715M against $683M of debt interest; the first is its
  // income-statement line). InterestExpenseOperating is last: it's how a REIT
  // like Realty Income files interest, and banks, which also use it, are n/a
  // for interest coverage anyway. Apple and Caterpillar file no standard
  // interest line, so they are n/a.
  //
  // Known gap: the SEC's frames for InterestExpenseNonoperating only include
  // 10-Ks filed from about mid-2026 (Microsoft's of July is in; NVIDIA's of
  // February is not), though each company's own companyfacts carries the
  // figure. Every other tag checked agrees with companyfacts exactly.
  interest_expense: [
    "InterestExpenseNonoperating",
    "InterestExpense",
    "InterestExpenseDebt",
    "InterestAndDebtExpense",
    "InterestExpenseOperating",
  ],
  // Dividends to common shareholders first. Johnson & Johnson files
  // PaymentsOfOrdinaryDividends; NVIDIA, Apple and Alphabet file the plain
  // PaymentsOfDividends.
  dividends_paid: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends"],
  // Banks and REITs present unclassified balance sheets and file neither, so
  // their current ratio is n/a.
  current_assets: ["AssetsCurrent"],
  current_liabilities: ["LiabilitiesCurrent"],

  // —— Net cash, both sides (checked 7 November 2026 against the year-end
  // 2025 frames for every screener company, and the latest 10-K balance
  // sheets of NVIDIA, Alphabet, Microsoft, Apple, Meta and Chevron) ——
  //
  // The company's own total of cash and short-term investments, where it
  // files one (Alphabet $126.8B, Microsoft $76.8B; 218 companies).
  cash_and_short_term_investments: ["CashCashEquivalentsAndShortTermInvestments"],
  // Otherwise cash plus ONE of these, never a sum: where a company files two,
  // they are usually the same line (61 of 112), and adding them never once
  // matched a company's own total. Apple and Meta file
  // MarketableSecuritiesCurrent; Microsoft ShortTermInvestments. Left out:
  // the general AvailableForSaleSecuritiesDebtSecurities, which isn't
  // "current" and would count Duke Energy's nuclear decommissioning fund and
  // Caterpillar's insurance holdings as cash. NVIDIA tags its marketable
  // securities ($52.0B) with its own element, which the frames don't carry,
  // so its cash side is its cash alone.
  short_term_investments: [
    "ShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "HeldToMaturitySecuritiesCurrent",
    "OtherShortTermInvestments",
    // The newer name for available-for-sale debt securities due within a
    // year: IBM's $0.8B of marketable securities (9 November 2026).
    "DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent",
  ],
  // All debt due within a year: short-term borrowings and the current part of
  // long-term debt together (Chevron's "Short-term debt", $10.9B).
  debt_current: ["DebtCurrent"],
  // The current part of long-term debt alone, which LongTermDebt already
  // includes (NVIDIA $1.0B, Apple $9.9B).
  long_term_debt_current: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  // Borrowings first made for under a year. One tag, never a sum, for the
  // same reason as short-term investments: ShortTermBorrowings often already
  // includes commercial paper. Apple files only CommercialPaper ($2.0B).
  short_term_borrowings: ["ShortTermBorrowings", "CommercialPaper", "OtherShortTermBorrowings", "ShortTermBankLoansAndNotesPayable"],
  // Long-term debt excluding the part due within a year. Read only to tell
  // whether the total-debt figure already includes current maturities:
  // Chevron files the same $39.8B under the "including current maturities"
  // tag and this one, so its $10.9B of short-term debt is on top.
  long_term_debt_noncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],

  // —— Return on invested capital's tax rate: income tax over pretax income.
  // 4,049 screener companies file the tax line and 3,760 the first pretax
  // tag in CY2025; the second (before equity-method income) adds 346.
  income_tax: ["IncomeTaxExpenseBenefit"],
  // A year's write-down of goodwill or other assets, one tag (Bumble's $656M
  // goodwill impairment in 2025). Read only by the gross margin check
  // (metrics.ts, grossMarginIsPartial), so a one-off loss isn't mistaken for
  // costs the cost of revenue left out.
  impairment: ["GoodwillImpairmentLoss", "AssetImpairmentCharges", "GoodwillAndIntangibleAssetImpairment", "ImpairmentOfIntangibleAssetsExcludingGoodwill"],
  pretax_income: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],

  // —— Money held for customers (checked 9 November 2026 against every
  // screener company's latest year-end, and the 10-K balance sheets of Wise,
  // MercadoLibre, ADP, Paychex, PayPal, Block, Fiserv, Paycom, Paylocity,
  // Western Union, Remitly, Shift4, Global Payments, Corpay, Bill and
  // Payoneer) ——
  // Paychex, Paycom, Paylocity and Bill file FundsHeldForClients; Block and
  // Payoneer CustomerFunds.
  customer_funds: ["FundsHeldForClients", "CustomerFunds"],
  // Money in transit between card holders, merchants and banks: Fiserv,
  // Western Union, Remitly, Block. Global Payments files only the liability.
  settlement_balances: ["SettlementAssetsCurrent", "SettlementLiabilitiesCurrent"],
  // Restricted cash filed as one figure rather than split into current and
  // noncurrent (those two are the normaliser's, read in frames.ts): ADP's
  // $6.4B, MercadoLibre's $9.9B, Corpay's $6.6B.
  restricted_cash: ["RestrictedCashAndCashEquivalents", "RestrictedCash", "RestrictedCashAndCashEquivalentsAtCarryingValue"],

  // —— Securities the cash side may have missed ——
  // NVIDIA's $52.0B of marketable securities, KLA's $3.3B and eBay's $1.1B sit
  // on their balance sheets under the companies' own elements, which the
  // frames don't carry. Their notes still file a total in the standard tag
  // (NVIDIA: $39.5B of available-for-sale debt securities), and that total,
  // less any long-term part, is the sign to go and read the balance sheet.
  securities_total: ["AvailableForSaleSecuritiesDebtSecurities"],
  securities_noncurrent: ["AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"],
};
