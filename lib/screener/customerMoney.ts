// Companies that hold their customers' money. Pure.
//
// A payments, payroll or fintech company keeps money that belongs to its
// customers: payroll funds waiting to be paid out (ADP, Paychex), balances
// in customers' accounts (Wise, PayPal, Block), money in transit between card
// holders and merchants (Fiserv, Western Union). That money passes through
// its cash flow and sits beside, or inside, its own cash, so free cash flow
// margin and net cash describe the customers' money as much as the company,
// as at a bank. Eli's rule (9 November 2026): such a company gets n/a for
// both, the way banks do, and for everything built on them (metrics.ts).
// Return on invested capital too (9 November 2026): its profit includes
// interest on the customers' money, which its capital doesn't.
//
// The rule: money held for customers worth at least a tenth of total assets
// and at least $25 million on the latest balance sheet, counting
//   - funds held for clients or customer funds (Paychex, Paycom, Paylocity,
//     Bill, Block, Paymentus, Airbnb, SS&C, Global-E);
//   - settlement assets or obligations (Fiserv, Western Union, Remitly,
//     Priority Technology, ACI Worldwide, Expensify), and
//   - restricted cash,
// these two only in the industries where they are customers' money:
// business services, software and data processing, staffing and payroll, and
// money transfer (SIC 6099, 7363, 7370-7379, 7389, 8700-8749). Elsewhere
// restricted cash is escrow, reclamation bonds or securitisation reserves
// (Crane, Peabody, Domino's), and a "settlement liability" is a lawsuit's
// (Neuraxis). The $25 million floor keeps out companies too small for the
// money to be customers' (nine with under $10 million of revenue had a few
// million of restricted cash that was a tenth of their assets).
//     Restricted cash is the larger of the one-figure restricted cash, the
//     current and noncurrent parts added up, and the cash total less the
//     company's own cash (PayPal files only the total, $24.0B against $8.1B
//     of its own). A restricted figure as large as the whole cash total is a
//     tagging slip (Amplitude files the same $0.08B as both) and is ignored.
// Measured on 9 November 2026 against every screener company, and checked
// by hand for MercadoLibre, ADP, Paychex, PayPal and Block, which Eli named.

import type { Assembled, BalanceItem, Picked } from "@/lib/screener/assemble";

export const CUSTOMER_MONEY_SHARE = 0.1;
export const CUSTOMER_MONEY_FLOOR = 25_000_000;

// [first SIC, last SIC]
const RESTRICTED_CASH_INDUSTRIES: [number, number][] = [
  [6099, 6099], // functions related to depository banking (money transfer)
  [7363, 7363], // help supply services (professional employer organisations)
  [7370, 7379], // software, data processing, computer services
  [7389, 7389], // business services not elsewhere classified (payments)
  [8700, 8749], // engineering, accounting and management services (Paychex)
];

// Checked by hand, by CIK.
export const CUSTOMER_MONEY_BY_HAND: ReadonlyMap<string, { holds: boolean; why: string }> = new Map([
  [
    "0002099039",
    {
      holds: true,
      why: "Wise files its customers' balances as its own cash ($27.8B of $33.3B of assets at March 2026), with no figure to tell the two apart. Eli's decision, 9 November 2026: treat it like a bank.",
    },
  ],
  [
    "0001144879",
    {
      holds: false,
      why: "Applied Digital's restricted cash ($2.4B at May 2026) is borrowed money set aside for building data centres, not customers' money.",
    },
  ],
]);

export type CustomerMoney = { holds: boolean; how: string | null };

function inIndustry(sic: string | null): boolean {
  const n = sic == null ? NaN : parseInt(sic, 10);
  return RESTRICTED_CASH_INDUSTRIES.some(([lo, hi]) => n >= lo && n <= hi);
}

type Balance = Partial<Record<BalanceItem, Picked>>;

// Restricted cash by the largest of the three ways it's filed, or null.
export function restrictedCash(B: Balance): { value: number; how: string } | null {
  const total = B.cash_with_restricted?.val ?? null;
  const options: { value: number; how: string }[] = [];
  if (B.restricted_cash) options.push({ value: B.restricted_cash.val, how: B.restricted_cash.tag });
  if (B.restricted_cash_current || B.restricted_cash_noncurrent) {
    const parts = [B.restricted_cash_current, B.restricted_cash_noncurrent].filter((p): p is Picked => p != null);
    options.push({ value: parts.reduce((s, p) => s + p.val, 0), how: parts.map((p) => p.tag).join(" + ") });
  }
  const own = B.cash_and_equivalents;
  if (total != null && own && !own.derived && own.tag === "CashAndCashEquivalentsAtCarryingValue") {
    options.push({ value: total - own.val, how: `${B.cash_with_restricted!.tag} - ${own.tag}` });
  }
  const usable = options.filter((o) => o.value > 0 && (total == null || o.value < total));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (b.value > a.value ? b : a));
}

export function customerMoney(cik: string, a: Assembled, sic: string | null): CustomerMoney {
  const hand = CUSTOMER_MONEY_BY_HAND.get(cik);
  if (hand) return { holds: hand.holds, how: hand.holds ? "checked by hand" : null };
  const B = a.balance;
  const assets = B.total_assets?.val;
  if (assets == null || assets <= 0) return { holds: false, how: null };
  const found: { value: number; how: string }[] = [];
  if (B.customer_funds) found.push({ value: B.customer_funds.val, how: B.customer_funds.tag });
  if (inIndustry(sic)) {
    if (B.settlement_balances) found.push({ value: B.settlement_balances.val, how: B.settlement_balances.tag });
    const r = restrictedCash(B);
    if (r) found.push(r);
  }
  const best = found
    .filter((f) => f.value >= assets * CUSTOMER_MONEY_SHARE && f.value >= CUSTOMER_MONEY_FLOOR)
    .sort((x, y) => y.value - x.value)[0];
  if (!best) return { holds: false, how: null };
  return { holds: true, how: `${best.how}: ${Math.round((best.value / assets) * 100)}% of total assets` };
}
