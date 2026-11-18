// Stock splits, found without a paid split feed. Pure, so the valuation page
// and its tests share it.
//
// Why it's needed: the SEC reports each quarter's share count as it stood on
// that date, while the price history is adjusted for every split since.
// NVIDIA's cover page said 2,460 million shares in May 2024 and 24,530 million
// in August 2024 because of the 10-for-1 split in between. Multiplying an
// adjusted price by an unadjusted count understates the market value tenfold.
//
// How: on any date, the price as traded divided by the split-adjusted price is
// the number of shares each old share has become since (NVIDIA on 7 June 2024:
// $1,208.88 / $120.89 = 10). That ratio is flat between splits and steps at
// each one, so the history becomes a short list of steps.

export type DatedClose = { date: string; close: number };

// From `from` onward (until the next step), a share counted on that date is
// `factor` shares on the adjusted series' basis.
export type SplitStep = { from: string; factor: number };

// A jump bigger than this between sessions is a new level. The smallest split
// in use, 5-for-4, moves the ratio 25%; a split-only adjustment otherwise
// leaves it flat to rounding.
const JUMP = 0.02;
// A new level must hold for the next two sessions too. One bad print in either
// series would otherwise read as two splits, up and straight back down.
const CONFIRM = 2;
const AGREE = 0.01;

function medianOfSorted(s: number[]): number {
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// A segment's ratios, kept in order as they arrive, so its median is read
// without sorting. Sorting the whole segment again for every new session was
// quadratic: about half a second of CPU on every Valuation and Earnings visit
// for a company with twelve years of prices and a split (NVIDIA, measured 17
// November 2026). The median is the same number either way.
class SortedRatios {
  readonly sorted: number[] = [];

  add(value: number): void {
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    this.sorted.splice(lo, 0, value);
  }

  get length(): number {
    return this.sorted.length;
  }

  median(): number {
    return medianOfSorted(this.sorted);
  }
}

function ratiosSegment(from: string, first: number): { from: string; values: SortedRatios } {
  const values = new SortedRatios();
  values.add(first);
  return { from, values };
}

export function splitSteps(unadjusted: DatedClose[], adjusted: DatedClose[]): SplitStep[] {
  const adj = new Map(adjusted.map((b) => [b.date, b.close]));
  const ratios: { date: string; r: number }[] = [];
  for (const u of unadjusted.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const a = adj.get(u.date);
    if (a && a > 0 && u.close > 0) ratios.push({ date: u.date, r: u.close / a });
  }
  if (ratios.length === 0) return [];

  const segments = [ratiosSegment(ratios[0].date, ratios[0].r)];
  for (let i = 1; i < ratios.length; i++) {
    const seg = segments[segments.length - 1];
    const { r } = ratios[i];
    if (Math.abs(r / seg.values.median() - 1) <= JUMP) {
      seg.values.add(r);
      continue;
    }
    const next = ratios.slice(i + 1, i + 1 + CONFIRM);
    if (next.length === CONFIRM && next.every((n) => Math.abs(n.r / r - 1) <= AGREE)) {
      segments.push(ratiosSegment(ratios[i].date, r));
    }
    // Otherwise a one-off bad print: skipped.
  }

  // A confirmed level always has at least three sessions, so a shorter segment
  // is a bad print on the very first day. Drop it.
  const kept = segments.filter((s, i) => s.values.length >= 3 || i === segments.length - 1);
  return kept.map((s) => ({ from: s.from, factor: s.values.median() }));
}

// The factor for a share count dated `date`. Before the first step, the first
// step's factor: the series starts after any date this site asks about.
export function factorAt(steps: SplitStep[], date: string): number {
  if (steps.length === 0) return 1;
  let factor = steps[0].factor;
  for (const step of steps) {
    if (step.from <= date) factor = step.factor;
    else break;
  }
  return factor;
}

// Whether a company's share counts could hide a split at all. If no count
// moves more than 15% from the one before (a 5-for-4 split is 25%), there was
// no split in the window and the extra price request isn't worth spending.
// A merger paid in stock can also trip this; the check then simply runs and
// finds no split.
export const MAX_ORDINARY_CHANGE = 1.15;

export function needsSplitCheck(counts: { date: string; value: number }[], currentShares: number | null): boolean {
  const ordered = counts.filter((c) => c.value > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const jumped = (a: number, b: number) => b / a > MAX_ORDINARY_CHANGE || a / b > MAX_ORDINARY_CHANGE;
  for (let i = 1; i < ordered.length; i++) {
    if (jumped(ordered[i - 1].value, ordered[i].value)) return true;
  }
  const latest = ordered[ordered.length - 1];
  return Boolean(latest && currentShares && currentShares > 0 && jumped(latest.value, currentShares));
}
