// Units errors in a company's own filing, and how to settle them. Pure.
// Shared by the research file's normaliser (normalize.ts) and the screener
// (lib/screener/assemble.ts), so a figure is judged the same way in both.
//
// A handful of filings tag one figure in the wrong units. Tigo Energy's 10-K
// for 2025 gives revenue as $103.5 million under Revenues and as $103.5
// billion under RevenueFromContractWithCustomerExcludingAssessedTax, so its
// research page showed $103.5 billion (found 5 November 2026). When two of a
// company's own tags for the same line item and period disagree by about a
// thousand or a million times, one of them is a units error. Each settle*
// function below decides which, from other figures in the same filing, and
// returns nothing at all rather than guess. A blank is fine; a wrong number is
// not.

// Two figures a units step apart: one is very close to a thousand or a
// million times the other. Within 2% by default, which is what the same
// figure in two units looks like after rounding (Tigo: exactly 1,000; a
// figure in millions against one in dollars: 998,738). That is deliberately
// tight. Genuinely different figures can sit a few hundred or a couple of
// thousand times apart (CarGurus' 2021 net income, $109.2 million, against its
// income to common shareholders, -$154,000, after a charge for its CarOffer
// stake: 709 times; IAC's 2017 revenue against its goods sales: 769 times;
// Fannie Mae's: 1,596 times). A looser test, tried first, blanked those two
// research-file figures in the check of every stored company.
//
// Comparisons with a different measure (EPS x shares, operating income) carry
// rounding and real differences, so callers pass a looser tolerance for those.
export function looksLikeUnitsError(a: number, b: number, tolerance = 0.02): boolean {
  if (a === 0 || b === 0) return false;
  const r = Math.max(Math.abs(a), Math.abs(b)) / Math.min(Math.abs(a), Math.abs(b));
  return [1_000, 1_000_000].some((step) => Math.abs(r / step - 1) <= tolerance);
}

const LOOSE = 0.1;

export function hasUnitsConflict(values: number[]): boolean {
  return values.some((a, i) => values.some((b, j) => i !== j && looksLikeUnitsError(a, b)));
}

// The same figure, a thousand or a million times larger or smaller (within
// 25%, and with the same sign).
function isShiftedCopy(bad: number, good: number): boolean {
  return [1e3, 1e6, 1e-3, 1e-6].some((f) => Math.abs((bad * f) / good - 1) <= 0.25);
}

// dollarsInOtherUnits: the filing's dollar figures, not its share count, are
// the ones in the wrong units (settleNetIncome), so every dollar figure from
// that filing is in doubt, revenue included.
export type Settled<T> = { picked: T | null; inconsistent: boolean; dollarsInOtherUnits?: boolean };

// Of candidates in the caller's own order of preference, the first that
// agrees with `expected`, provided every candidate it passes over is that same
// figure shifted by a units factor. A candidate passed over for any other
// reason would mean two genuinely different figures, and choosing between
// them is not a units question.
function firstAgreeing<T extends { val: number }>(candidates: T[], agrees: (v: number) => boolean): Settled<T> {
  const index = candidates.findIndex((c) => agrees(c.val));
  if (index < 0) return { picked: null, inconsistent: true };
  const chosen = candidates[index];
  if (candidates.slice(0, index).some((c) => !isShiftedCopy(c.val, chosen.val))) return { picked: null, inconsistent: true };
  return { picked: chosen, inconsistent: false };
}

// —— Revenue ——
// Settled by the income statement's own arithmetic: revenue is gross profit
// plus cost of revenue. Tigo: $44.351M + $59.185M = $103.536M, which is the
// Revenues figure. Without both to check against, n/a.
export function settleRevenue<T extends { val: number }>(
  candidates: T[],
  grossProfit: number | null,
  costOfRevenue: number | null,
): Settled<T> {
  if (candidates.length === 0) return { picked: null, inconsistent: false };
  if (!hasUnitsConflict(candidates.map((c) => c.val))) return { picked: candidates[0], inconsistent: false };
  if (grossProfit == null || costOfRevenue == null) return { picked: null, inconsistent: true };
  const expected = grossProfit + costOfRevenue;
  return firstAgreeing(candidates, (v) => expected !== 0 && Math.abs(v - expected) <= Math.abs(expected) * 0.01);
}

// —— Operating cash flow ——
// Nothing else in a filing pins it down, so a units-shaped disagreement
// between its tags is n/a.
export function settleCashFlow<T extends { val: number }>(candidates: T[]): Settled<T> {
  if (candidates.length === 0) return { picked: null, inconsistent: false };
  return hasUnitsConflict(candidates.map((c) => c.val)) ? { picked: null, inconsistent: true } : { picked: candidates[0], inconsistent: false };
}

// —— Net income ——
// Earnings per share times diluted shares is net income to common
// shareholders, from the same filing.
// - The company's tags agree, and agree with EPS x shares within units: the
//   first candidate, as always.
// - They disagree by a units factor: the first within 25% of EPS x shares
//   (plus half a cent a share, for EPS rounding), if every candidate it
//   passes over is a shifted copy of it. A real gap between two concepts is
//   never passed over: Fannie Mae's net income ($14.4 billion) and its income
//   to common shareholders ($9 million, which its EPS reflects) are 1,600
//   times apart because the Treasury's preferred shares take the rest.
// - The tags agree with each other but not with EPS x shares: either net
//   income or the share count is in the wrong units, and both happen (Rocky
//   Mountain Chocolate's net income filed as -$4,560; Smith & Wesson's share
//   count as 44,933). Operating income settles it: net income stands only
//   when it is in operating income's range and EPS x shares is far outside
//   it. Otherwise, or with no operating income to ask, n/a.
// - Operating income can't tell the two apart when a filing has every dollar
//   figure in the wrong units: Universe Pharmaceuticals' annual report for
//   the year to September 2025 gives revenue as $17.9 billion, net income as
//   -$3.7 billion and operating income as -$2.9 billion, all a thousand times
//   too large (its previous report gave the year before as $23.0 million of
//   revenue; the new one restates it as $23.0 billion), while EPS (-$8.06)
//   and the share count (455,871) are right. The share count on the report's
//   cover page, typed apart from the statements, settles it: the same order
//   as the weighted count (within 30 times either way, for a reverse split
//   or new shares) means the share count is right, so the dollars are not,
//   and net income is n/a with dollarsInOtherUnits set. Of the 46 companies
//   whose net income and EPS x shares were a units step apart on 9 November
//   2026, it was the only one; the other 45 file their share count in
//   thousands, and their covers say so.
export const COVER_SAME_ORDER = 30;

export function settleNetIncome<T extends { val: number }>(
  candidates: T[],
  eps: number | null,
  shares: number | null,
  operatingIncome: number | null,
  coverShares: number | null = null,
): Settled<T> {
  if (candidates.length === 0) return { picked: null, inconsistent: false };
  const expected = eps != null && shares != null && shares > 0 ? eps * shares : null;
  const pairConflict = hasUnitsConflict(candidates.map((c) => c.val));
  const epsConflict = expected != null && expected !== 0 && looksLikeUnitsError(candidates[0].val, expected, LOOSE);
  if (!pairConflict && !epsConflict) return { picked: candidates[0], inconsistent: false };
  if (!pairConflict) {
    if (coverShares != null && coverShares > 0 && shares != null) {
      const r = coverShares / shares;
      if (r < COVER_SAME_ORDER && r > 1 / COVER_SAME_ORDER) return { picked: null, inconsistent: true, dollarsInOtherUnits: true };
    }
    // Which of the two is in the same range as operating income: within 30
    // times of it counts as near, beyond 100 times as far. Net income near and
    // EPS x shares far means the share count is in other units, and net
    // income stands; the reverse means net income is; anything else, n/a.
    if (operatingIncome == null || operatingIncome === 0) return { picked: null, inconsistent: true };
    const gap = (x: number) => Math.abs(Math.log10(Math.abs(x) / Math.abs(operatingIncome)));
    const near = (x: number) => gap(x) < Math.log10(30);
    const far = (x: number) => gap(x) > 2;
    const income = candidates[0].val;
    if (near(income) && far(expected!)) return { picked: candidates[0], inconsistent: false };
    return { picked: null, inconsistent: true };
  }
  if (expected == null) return { picked: null, inconsistent: true };
  const tolerance = Math.max(Math.abs(expected) * 0.25, 0.005 * shares!);
  return firstAgreeing(candidates, (v) => Math.abs(v - expected) <= tolerance);
}
