// "What stands out" on the Overview: up to three facts, picked by rules from the
// stored SEC financials. Rules, not AI (phase nine, Stage 2), so every sentence
// is reproducible from the numbers and every rule is unit-tested.
//
// Facts only. Each sentence says what happened, never whether it is good or bad
// or what anyone should do about it: no "strong", no "concerning", no "buy".
// The wording deliberately avoids even innocent words a crude scan for verdict
// language would trip on ("buying back" becomes "repurchasing", there is no
// "shareholders"), because Stage 4's check searches the rendered HTML for
// "buy", "sell" and "hold".

import type { FilerKind } from "@/lib/sec/concepts";
import type { FinancialRow } from "@/lib/sec/normalize";
import { FinancialSeries } from "@/lib/research/series";
import { formatMoney, formatPct, yearPhrase } from "@/lib/research/format";

export type StandOutFact = { id: string; text: string };

export type StandsOutInput = {
  rows: FinancialRow[];
  filerKind: FilerKind;
  fiscalYearEnd: string | null;
  price?: number | null;
  range52?: { low: number; high: number } | null;
};

// "31 times", "3.4 times".
function times(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)} times` : `${ratio.toFixed(1)} times`;
}

function pctChange(from: number, to: number): number {
  return ((to - from) / Math.abs(from)) * 100;
}

type Rule = (s: FinancialSeries, input: StandsOutInput, year: number) => StandOutFact | null;

// A company that swung between profit and loss: the most important single fact.
const profitTurn: Rule = (s, input, year) => {
  const now = s.annual("net_income", year);
  const before = s.annual("net_income", year - 1);
  if (now == null || before == null) return null;
  const y = (fy: number) => yearPhrase(fy, input.fiscalYearEnd);
  if (now > 0 && before < 0) {
    return { id: "profit-turn", text: `It earned a ${formatMoney(now)} profit in ${y(year)} after a ${formatMoney(Math.abs(before))} loss in ${y(year - 1)}.` };
  }
  if (now < 0 && before > 0) {
    return { id: "profit-turn", text: `It lost ${formatMoney(Math.abs(now))} in ${y(year)} after a ${formatMoney(before)} profit in ${y(year - 1)}.` };
  }
  if (now < 0 && before < 0) {
    let streak = 0;
    for (let fy = year; (s.annual("net_income", fy) ?? 0) < 0; fy--) streak++;
    return { id: "profit-turn", text: `It has reported a net loss in each of the last ${streak} years, ${formatMoney(Math.abs(now))} in ${y(year)}.` };
  }
  return null;
};

// How far revenue has come over (up to) ten years, plus the latest year's move.
const growthMultiple: Rule = (s, input, year) => {
  const latest = s.annual("revenue", year);
  if (!latest || latest <= 0) return null;
  const years = s.annualYears("revenue").filter((fy) => fy >= year - 10 && fy <= year - 5);
  const base = years.find((fy) => (s.annual("revenue", fy) ?? 0) > 0);
  if (base == null) return null;
  const baseValue = s.annual("revenue", base) as number;
  const ratio = latest / baseValue;
  const y = (fy: number) => yearPhrase(fy, input.fiscalYearEnd);

  let lead: string;
  if (ratio >= 2) lead = `Revenue is ${times(ratio)} what it was in ${y(base)}`;
  else if (ratio >= 1.05) lead = `Revenue is ${Math.round((ratio - 1) * 100)}% higher than in ${y(base)}`;
  else if (ratio <= 0.95) lead = `Revenue is ${Math.round((1 - ratio) * 100)}% lower than in ${y(base)}`;
  else lead = `Revenue is about where it was in ${y(base)}`;

  const prior = s.annual("revenue", year - 1);
  if (prior && prior > 0) {
    const change = pctChange(prior, latest);
    const verb = change >= 0 ? "rose" : "fell";
    return { id: "growth", text: `${lead}, and ${verb} ${Math.abs(Math.round(change))}% in ${y(year)} to ${formatMoney(latest)}.` };
  }
  return { id: "growth", text: `${lead}, at ${formatMoney(latest)} in ${y(year)}.` };
};

// A margin that moved two points or more in the latest year. Gross margin where
// it means something, operating margin where it doesn't (banks, insurers).
const marginMove: Rule = (s, input, year) => {
  const useGross = input.filerKind === "operating" && s.grossMargin(year) != null && s.grossMargin(year - 1) != null;
  const label = useGross ? "Gross margin" : "Operating margin";
  const at = (fy: number) => (useGross ? s.grossMargin(fy) : s.margin("operating_income", fy));
  const now = at(year);
  const before = at(year - 1);
  if (now == null || before == null) return null;
  const movePoints = (now - before) * 100;
  if (Math.abs(movePoints) < 2) return null;
  const y = (fy: number) => yearPhrase(fy, input.fiscalYearEnd);
  const verb = movePoints < 0 ? "fell" : "rose";
  let text = `${label} ${verb} from ${formatPct(before * 100)} to ${formatPct(now * 100)} in ${y(year)}`;

  // Put the move in the context of the company's own history, when there is
  // enough of it to say something true.
  const history = s.annualYears("revenue").filter((fy) => fy < year && at(fy) != null);
  if (movePoints < 0) {
    const lastDecline = history
      .slice()
      .reverse()
      .find((fy) => {
        const m = at(fy);
        const p = at(fy - 1);
        return m != null && p != null && m < p;
      });
    if (lastDecline != null) text += `, the first decline since ${y(lastDecline)}`;
    else if (history.length >= 4) text += `, its first decline in the ${history.length + 1} years shown`;
  } else {
    const all = [...history, year].map((fy) => at(fy) as number);
    if (all.length >= 5 && now >= Math.max(...all)) text += `, the highest in the ${all.length} years shown`;
  }
  return { id: "margin", text: `${text}.` };
};

// Cash spent repurchasing shares, against what the business generated.
const repurchases: Rule = (s, input, year) => {
  const spent = s.annual("buybacks", year);
  if (!spent || spent <= 0) return null;
  const y = yearPhrase(year, input.fiscalYearEnd);
  // Free cash flow is suppressed for banks and insurers; net income is the
  // honest comparison there.
  const fcf = input.filerKind === "operating" ? s.annual("free_cash_flow", year) : null;
  const base = fcf != null ? { value: fcf, name: "free cash flow" } : null;
  const income = s.annual("net_income", year);
  const against = base ?? (income != null ? { value: income, name: "net income" } : null);
  if (!against || against.value <= 0) {
    return { id: "repurchases", text: `It spent ${formatMoney(spent)} repurchasing its own shares in ${y}.` };
  }
  const share = (spent / against.value) * 100;
  if (share > 100) {
    return {
      id: "repurchases",
      text: `It spent ${formatMoney(spent)} repurchasing its own shares in ${y}, more than its ${formatMoney(against.value)} of ${against.name}.`,
    };
  }
  return {
    id: "repurchases",
    text: `It spent ${formatMoney(spent)} repurchasing its own shares in ${y}, about ${Math.round(share)}% of its ${against.name}.`,
  };
};

// A share count that moved by a few percent over five years.
//
// The SEC's share counts are as filed, not adjusted for stock splits: NVIDIA's
// diluted count goes from 2,535M in fiscal 2022 to 25,070M in fiscal 2023
// across its ten-for-one split. A year-on-year jump that size is a split (or a
// merger), not a trend, so any window containing one says nothing at all.
const SPLIT_SIZED_JUMP = 1.5;

const shareCount: Rule = (s, input, year) => {
  const now = s.annual("shares_diluted", year);
  const before = s.annual("shares_diluted", year - 5);
  if (!now || !before) return null;
  for (let fy = year - 4; fy <= year; fy++) {
    const a = s.annual("shares_diluted", fy - 1);
    const b = s.annual("shares_diluted", fy);
    if (!a || !b) return null;
    const ratio = b / a;
    if (ratio >= SPLIT_SIZED_JUMP || ratio <= 1 / SPLIT_SIZED_JUMP) return null;
  }
  const change = pctChange(before, now);
  if (change > -3 && change < 5) return null;
  const direction = change < 0 ? "lower" : "higher";
  return {
    id: "share-count",
    text: `Its diluted share count is ${Math.abs(Math.round(change))}% ${direction} than in ${yearPhrase(year - 5, input.fiscalYearEnd)}.`,
  };
};

// Where the price sits in its 52-week range, when it's at either end.
const nearRangeEdge: Rule = (_s, input) => {
  const { price, range52 } = input;
  if (!price || !range52 || range52.high <= range52.low) return null;
  const belowHigh = ((range52.high - price) / range52.high) * 100;
  const aboveLow = ((price - range52.low) / range52.low) * 100;
  if (belowHigh <= 2) {
    return {
      id: "range",
      text: belowHigh < 0.05 ? "The stock is at its 52-week high." : `The stock is within ${Math.max(1, Math.round(belowHigh))}% of its 52-week high.`,
    };
  }
  if (aboveLow <= 2) {
    return {
      id: "range",
      text: aboveLow < 0.05 ? "The stock is at its 52-week low." : `The stock is within ${Math.max(1, Math.round(aboveLow))}% of its 52-week low.`,
    };
  }
  return null;
};

// In priority order. The first three that apply are shown.
const RULES: Rule[] = [profitTurn, growthMultiple, marginMove, repurchases, shareCount, nearRangeEdge];

export function whatStandsOut(input: StandsOutInput, max = 3): { facts: StandOutFact[]; fiscalYear: number | null } {
  const series = new FinancialSeries(input.rows);
  const year = series.latestFiscalYear();
  if (year == null) return { facts: [], fiscalYear: null };
  const facts: StandOutFact[] = [];
  for (const rule of RULES) {
    if (facts.length >= max) break;
    const fact = rule(series, input, year);
    if (fact) facts.push(fact);
  }
  return { facts, fiscalYear: year };
}
