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

export function looksLikeUnitsError(a: number, b: number): boolean {
  if (a === 0 || b === 0) return false;
  const r = Math.max(Math.abs(a), Math.abs(b)) / Math.min(Math.abs(a), Math.abs(b));
  return (r >= 500 && r <= 2_000) || (r >= 500_000 && r <= 2_000_000);
}

export function hasUnitsConflict(values: number[]): boolean {
  return values.some((a, i) => values.some((b, j) => i !== j && looksLikeUnitsError(a, b)));
}

// The same figure, a thousand or a million times larger or smaller (within
// 25%, and with the same sign).
function isShiftedCopy(bad: number, good: number): boolean {
  return [1e3, 1e6, 1e-3, 1e-6].some((f) => Math.abs((bad * f) / good - 1) <= 0.25);
}

export type Settled<T> = { picked: T | null; inconsistent: boolean };

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
//   count as 44,933). Operating income settles it: net income a units step
//   from operating income too is the odd one out (n/a); otherwise the share
//   count is, and net income stands. With no operating income to ask, n/a.
export function settleNetIncome<T extends { val: number }>(
  candidates: T[],
  eps: number | null,
  shares: number | null,
  operatingIncome: number | null,
): Settled<T> {
  if (candidates.length === 0) return { picked: null, inconsistent: false };
  const expected = eps != null && shares != null && shares > 0 ? eps * shares : null;
  const pairConflict = hasUnitsConflict(candidates.map((c) => c.val));
  const epsConflict = expected != null && expected !== 0 && looksLikeUnitsError(candidates[0].val, expected);
  if (!pairConflict && !epsConflict) return { picked: candidates[0], inconsistent: false };
  if (!pairConflict) {
    if (operatingIncome == null) return { picked: null, inconsistent: true };
    return looksLikeUnitsError(candidates[0].val, operatingIncome)
      ? { picked: null, inconsistent: true }
      : { picked: candidates[0], inconsistent: false };
  }
  if (expected == null) return { picked: null, inconsistent: true };
  const tolerance = Math.max(Math.abs(expected) * 0.25, 0.005 * shares!);
  return firstAgreeing(candidates, (v) => Math.abs(v - expected) <= tolerance);
}
