// The Insiders tab's arithmetic and words (phase nine, stage 6). Pure.
//
// Facts about what insiders filed, never a reading of it: no "bullish", no
// "confidence", no "insiders are dumping". A sale under a plan set up months
// earlier says something different from one that isn't, so the page says
// which is which and leaves the meaning to the reader.

import type { InsiderTrade } from "@/lib/sec/form4";

// The SEC's transaction codes in plain words. Purchases and sales are the
// default view; everything else (mostly pay: grants, vesting, the shares
// withheld to cover tax on it) is behind "all transactions".
const CODE_LABELS: Record<string, string> = {
  P: "Bought",
  S: "Sold",
  A: "Grant or award",
  M: "Exercise or vesting",
  X: "Option exercise",
  O: "Option exercise",
  F: "Withheld for tax",
  G: "Gift",
  D: "Returned to the company",
  C: "Conversion",
  E: "Option expired",
  H: "Option expired",
  I: "Discretionary trade",
  J: "Other",
  K: "Equity swap",
  L: "Small acquisition",
  U: "Tendered in a takeover",
  V: "Reported voluntarily",
  W: "Inherited",
  Z: "Moved in or out of a trust",
};

export function codeLabel(code: string): string {
  return CODE_LABELS[code] ?? `Other (code ${code})`;
}

// A transaction in plain words, telling the two sides of an exercise apart:
// the shares received (non-derivative) and the options or units used up
// (derivative), which a Form 4 reports as separate lines.
export function tradeLabel(t: Pick<InsiderTrade, "code" | "isDerivative">): string {
  if (!t.isDerivative) return codeLabel(t.code);
  if (t.code === "M" || t.code === "X" || t.code === "O") return "Options or units exercised";
  if (t.code === "A") return "Options or units granted";
  if (t.code === "E" || t.code === "H") return "Options expired";
  return `${codeLabel(t.code)} (options or units)`;
}

// An open-market or private purchase or sale of the shares themselves.
export function isMarketTrade(t: Pick<InsiderTrade, "code" | "isDerivative">): boolean {
  return !t.isDerivative && (t.code === "P" || t.code === "S");
}

export function tradeValue(t: Pick<InsiderTrade, "shares" | "price">): number | null {
  return t.shares != null && t.price != null && t.price > 0 ? t.shares * t.price : null;
}

// An amendment (Form 4/A) often repeats the original's lines word for word.
// Counting both would double the trade, so an exact repeat of another
// filing's line is dropped, keeping the latest filed.
//
// Repeats within one filing are separate trades (several lots sold on one day
// at one price), so they all stay.
export function withoutRepeats(trades: InsiderTrade[]): InsiderTrade[] {
  const key = (t: InsiderTrade) =>
    [t.ownerCik ?? t.ownerName, t.date, t.code, t.shares, t.price, t.isDerivative, t.security].join("|");
  const newest = new Map<string, InsiderTrade>();
  for (const t of trades) {
    const seen = newest.get(key(t));
    if (!seen || t.filedAt > seen.filedAt || (t.filedAt === seen.filedAt && t.accession > seen.accession)) newest.set(key(t), t);
  }
  return trades.filter((t) => newest.get(key(t))!.accession === t.accession);
}

type Side = { value: number; shares: number; trades: number; insiders: number };

export type InsiderSummary = {
  from: string;
  bought: Side;
  sold: Side & { onPlanValue: number };
  // Of the sales by value, the share made under a preset plan. Null with no
  // priced sales.
  onPlanShare: number | null;
};

export function summarize(trades: InsiderTrade[], asOf: string): InsiderSummary {
  const fromDate = new Date(asOf);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
  const from = fromDate.toISOString().slice(0, 10);

  const side = (code: "P" | "S") => {
    const list = trades.filter((t) => isMarketTrade(t) && t.code === code && t.date != null && t.date >= from && t.date <= asOf);
    return {
      list,
      value: list.reduce((s, t) => s + (tradeValue(t) ?? 0), 0),
      shares: list.reduce((s, t) => s + (t.shares ?? 0), 0),
      trades: list.length,
      insiders: new Set(list.map((t) => t.ownerCik ?? t.ownerName)).size,
    };
  };
  const b = side("P");
  const s = side("S");
  const onPlanValue = s.list.filter((t) => t.onPlan).reduce((sum, t) => sum + (tradeValue(t) ?? 0), 0);
  return {
    from,
    bought: { value: b.value, shares: b.shares, trades: b.trades, insiders: b.insiders },
    sold: { value: s.value, shares: s.shares, trades: s.trades, insiders: s.insiders, onPlanValue },
    onPlanShare: s.value > 0 ? onPlanValue / s.value : null,
  };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)} billion`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)} million`;
  if (v >= 1e3) return `$${Math.round(v / 1e3).toLocaleString("en-US")} thousand`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

// The summary in plain sentences.
export function summarySentences(s: InsiderSummary): string[] {
  const out: string[] = [];
  if (s.bought.trades === 0 && s.sold.trades === 0) {
    return ["No insider bought or sold the company's shares on the open market in the past 12 months, according to their Form 4 filings."];
  }
  const bought = `${money(s.bought.value)} of shares in ${plural(s.bought.trades, "purchase", "purchases")} by ${plural(s.bought.insiders, "person", "people")}`;
  const sold = `${money(s.sold.value)} of shares in ${plural(s.sold.trades, "sale", "sales")} by ${plural(s.sold.insiders, "person", "people")}`;
  if (s.bought.trades && s.sold.trades) {
    out.push(`Over the past 12 months, insiders bought ${bought}, and sold ${sold}.`);
  } else if (s.sold.trades) {
    out.push(`Over the past 12 months, insiders sold ${sold}. None bought shares on the open market.`);
  } else {
    out.push(`Over the past 12 months, insiders bought ${bought}. None sold.`);
  }
  if (s.onPlanShare != null) {
    const pct = Math.round(s.onPlanShare * 100);
    out.push(
      pct === 100
        ? "All of the sales by value were made under preset trading plans (Rule 10b5-1), set up in advance."
        : pct === 0
          ? "None of the sales were made under a preset trading plan (Rule 10b5-1)."
          : `${pct}% of the sales by value were made under preset trading plans (Rule 10b5-1), set up in advance.`,
    );
  }
  return out;
}
