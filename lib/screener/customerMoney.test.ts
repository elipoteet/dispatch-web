import { describe, expect, it } from "vitest";
import { CUSTOMER_MONEY_BY_HAND, customerMoney, restrictedCash } from "@/lib/screener/customerMoney";
import type { Assembled, BalanceItem, Picked } from "@/lib/screener/assemble";

const pk = (val: number, tag = "Tag", derived = false): Picked => ({ val, end: "2025-12-31", tag, accn: "A", ...(derived ? { derived } : {}) });

function co(balance: Partial<Record<BalanceItem, Picked>>): Assembled {
  return {
    cik: 1,
    name: "Test",
    latest: { periodStart: "2025-01-01", periodEnd: "2025-12-31", values: {}, inconsistent: [] },
    prior: null,
    balance,
    revenueHistory: [],
    revenueHistoryInconsistent: [],
    threeYearsBack: null,
  };
}

describe("customer money", () => {
  it("counts funds held for clients at a tenth of assets or more (Paychex: 30%)", () => {
    const r = customerMoney("0000723531", co({ total_assets: pk(16e9), customer_funds: pk(4.83e9, "FundsHeldForClients") }), "8700");
    expect(r.holds).toBe(true);
    expect(r.how).toBe("FundsHeldForClients: 30% of total assets");
    expect(customerMoney("1", co({ total_assets: pk(16e9), customer_funds: pk(1.0e9) }), "8700").holds).toBe(false);
  });

  it("counts settlement balances and restricted cash only in payment and payroll industries", () => {
    const fiserv = co({ total_assets: pk(78e9), settlement_balances: pk(16.48e9, "SettlementAssetsCurrent") });
    expect(customerMoney("2", fiserv, "7389").holds).toBe(true);
    // A medical device maker's settlement liability is a lawsuit's.
    expect(customerMoney("2", fiserv, "3845").holds).toBe(false);
    const adp = co({ total_assets: pk(64e9), restricted_cash: pk(6.4e9, "RestrictedCashAndCashEquivalents") });
    expect(customerMoney("3", adp, "7374").holds).toBe(true);
    // A coal miner's reclamation bonds aren't customers' money.
    expect(customerMoney("3", adp, "1221").holds).toBe(false);
  });

  it("works restricted cash out from the cash total when that's all there is (PayPal)", () => {
    const B = {
      total_assets: pk(80.17e9),
      cash_and_equivalents: pk(8.05e9, "CashAndCashEquivalentsAtCarryingValue"),
      cash_with_restricted: pk(24.02e9, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"),
    };
    expect(restrictedCash(B)?.value).toBeCloseTo(15.97e9);
    expect(customerMoney("4", co(B), "7389").holds).toBe(true);
  });

  it("ignores restricted cash as large as the whole cash total, a tagging slip (Amplitude)", () => {
    const B = {
      total_assets: pk(0.42e9),
      cash_and_equivalents: pk(0.08e9, "CashAndCashEquivalentsAtCarryingValue"),
      cash_with_restricted: pk(0.08e9),
      restricted_cash: pk(0.08e9),
    };
    expect(restrictedCash(B)).toBeNull();
    expect(customerMoney("5", co(B), "7372").holds).toBe(false);
  });

  it("needs at least $25 million, so a microcap's few million of restricted cash doesn't count", () => {
    expect(customerMoney("6", co({ total_assets: pk(13e6), restricted_cash: pk(6e6) }), "7373").holds).toBe(false);
  });

  it("takes the hand-checked answer first: Wise in, Applied Digital out", () => {
    expect(customerMoney("0002099039", co({}), "7389")).toEqual({ holds: true, how: "checked by hand" });
    const apld = co({ total_assets: pk(9.93e9), restricted_cash: pk(2.38e9) });
    expect(customerMoney("0001144879", apld, "7374").holds).toBe(false);
    for (const cik of CUSTOMER_MONEY_BY_HAND.keys()) expect(cik).toMatch(/^\d{10}$/);
  });
});
