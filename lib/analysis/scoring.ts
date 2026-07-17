// Ported 1:1 from the-dispatch.html's scoreFundamentals/scoreTechnicals/
// scoreSentiment — same weights, same thresholds, same signal wording.

import { fmt } from "./indicators";
import type { Fundamentals } from "@/lib/providers";

export type Score = { score: number | null; signal: string };

export function scoreFundamentals(f: Fundamentals | null): Score {
  if (!f || !f.metrics) {
    return { score: null, signal: "No fundamentals data — Finnhub key not configured." };
  }
  const m = f.metrics;
  let score = 5;
  const signals: string[] = [];

  const revGrowth = m.revenueGrowthTTMYoy;
  if (revGrowth != null) {
    if (revGrowth > 30) {
      score += 2;
      signals.push(`triple-digit-ish revenue growth (+${fmt(revGrowth, 0)}% YoY)`);
    } else if (revGrowth > 10) {
      score += 1;
      signals.push(`healthy revenue growth (+${fmt(revGrowth, 0)}% YoY)`);
    } else if (revGrowth > 0) {
      signals.push(`modest revenue growth (+${fmt(revGrowth, 0)}% YoY)`);
    } else {
      score -= 1;
      signals.push(`revenue declining (${fmt(revGrowth, 0)}% YoY)`);
    }
  }

  const pm = m.netProfitMarginTTM;
  if (pm != null) {
    if (pm > 20) {
      score += 1.5;
      signals.push(`excellent margins (${fmt(pm, 1)}%)`);
    } else if (pm > 10) {
      score += 0.5;
      signals.push(`solid margins (${fmt(pm, 1)}%)`);
    } else if (pm < 0) {
      score -= 1.5;
      signals.push(`GAAP-unprofitable (${fmt(pm, 1)}% margin)`);
    }
  }

  const de = m["totalDebt/totalEquityAnnual"];
  if (de != null) {
    if (de > 2) {
      score -= 1;
      signals.push(`elevated leverage (D/E ${fmt(de, 2)})`);
    } else if (de < 0.5) {
      score += 0.5;
      signals.push(`clean balance sheet (D/E ${fmt(de, 2)})`);
    }
  }

  score = Math.max(1, Math.min(10, Math.round(score)));
  const signal = signals.length ? signals.slice(0, 2).join("; ") : "mixed fundamental profile";
  return { score, signal };
}

export type TechnicalIndicators = {
  last: number;
  ma50: number | null;
  ma200: number | null;
  rsiVal: number | null;
  d90: number | null;
  d365: number | null;
};

export function scoreTechnicals(indicators: TechnicalIndicators): Score {
  let score = 5;
  const signals: string[] = [];
  const { last, ma50, ma200, rsiVal, d90, d365 } = indicators;

  if (ma50 && ma200) {
    if (last > ma50 && ma50 > ma200) {
      score += 2;
      signals.push("textbook uptrend (price > 50d > 200d)");
    } else if (last < ma50 && ma50 < ma200) {
      score -= 2;
      signals.push("textbook downtrend");
    } else if (last > ma200) {
      score += 0.5;
      signals.push("above 200-day");
    } else {
      score -= 0.5;
      signals.push("below 200-day");
    }
  }

  if (rsiVal != null) {
    if (rsiVal > 70) {
      score += 0.5;
      signals.push(`overbought (RSI ${fmt(rsiVal, 0)})`);
    } else if (rsiVal < 30) {
      score -= 0.5;
      signals.push(`oversold (RSI ${fmt(rsiVal, 0)})`);
    } else if (rsiVal > 55) {
      score += 0.5;
    }
  }

  if (d90 != null) {
    if (d90 > 15) {
      score += 1;
      signals.push(`strong 90-day momentum (+${fmt(d90, 0)}%)`);
    } else if (d90 < -15) {
      score -= 1;
      signals.push(`poor 90-day momentum (${fmt(d90, 0)}%)`);
    }
  }

  if (d365 != null && d365 > 50) score += 0.5;

  score = Math.max(1, Math.min(10, Math.round(score)));
  return { score, signal: signals.slice(0, 2).join("; ") };
}

export function scoreSentiment(f: Fundamentals | null): Score {
  if (!f || !f.reco || !Array.isArray(f.reco) || !f.reco.length) {
    return { score: null, signal: "No analyst data — Finnhub key not configured." };
  }
  const r = f.reco[0];
  const total = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
  if (!total) return { score: 5, signal: "no coverage" };
  const weighted =
    ((r.strongBuy || 0) * 10 + (r.buy || 0) * 7.5 + (r.hold || 0) * 5 + (r.sell || 0) * 2.5 + (r.strongSell || 0) * 0) /
    total;
  const score = Math.round(weighted);
  const bullish = (r.strongBuy || 0) + (r.buy || 0);
  const bearish = (r.sell || 0) + (r.strongSell || 0);
  let signal: string;
  if (bullish > bearish * 3) signal = `${bullish} of ${total} analysts bullish — strong consensus buy`;
  else if (bullish > bearish) signal = `${bullish} of ${total} analysts bullish — net positive coverage`;
  else if (bearish > bullish) signal = `${bearish} of ${total} analysts bearish — net negative coverage`;
  else signal = `mixed consensus (${bullish} buy / ${r.hold || 0} hold / ${bearish} sell)`;
  return { score, signal };
}
