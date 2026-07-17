// Ported from the-dispatch.html's renderReport(). Original directly wrote
// into the DOM (document.getElementById(...).innerHTML = ...); this version
// keeps the exact same computation and prose wording but returns a plain
// object for React to render instead.

import type { Fundamentals, NewsItem, PriceRow } from "@/lib/providers";
import {
  annualizedVol,
  fmt,
  fmtBig,
  macd,
  maxDrawdown,
  pctChange,
  rsi,
  sign,
  sma,
} from "./indicators";
import { scoreFundamentals, scoreSentiment, scoreTechnicals, type Score } from "./scoring";

export type KeyStat = { label: string; value: string; sub?: string; className?: string };
export type ScorecardRow = { name: string; score: number | null; signal: string; isComposite?: boolean };

export type ReportData = {
  ticker: string;
  name: string;
  industry: string;
  price: string;
  changeText: string;
  changeClassName: "pos" | "neg";
  rating: string;
  ratingClass: "buy" | "hold" | "sell";
  composite: number;
  timestamp: string;
  keyStats: KeyStat[];
  scorecard: ScorecardRow[];
  proseFundamentalsHtml: string;
  proseTechnicalsHtml: string;
  proseSentimentHtml: string;
  proseVerdictHtml: string;
  risksHtml: string[];
  catalystHtml: string;
  news: NewsItem[] | null;
  rows: PriceRow[];
};

export function buildReport(
  sym: string,
  rows: PriceRow[],
  fund: Fundamentals | null,
  news: NewsItem[] | null,
): ReportData {
  const prices = rows.map((r) => r.close);
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  const d1abs = last - prev;
  const d1pct = (d1abs / prev) * 100;
  const d30 = pctChange(prices, 30);
  const d90 = pctChange(prices, 90);
  const d365 = pctChange(prices, 252);
  const ma50arr = sma(prices, 50);
  const ma200arr = sma(prices, 200);
  const ma50 = ma50arr[ma50arr.length - 1];
  const ma200 = ma200arr[ma200arr.length - 1];
  const rsiVal = rsi(prices, 14);
  const macdVal = macd(prices);
  const vol = annualizedVol(prices.slice(-252));
  const dd = maxDrawdown(prices.slice(-252));
  const w52 = prices.slice(-252);
  const w52high = w52.length ? Math.max(...w52) : last;
  const w52low = w52.length ? Math.min(...w52) : last;
  const pctFromHigh = ((last - w52high) / w52high) * 100;
  const pctFromLow = ((last - w52low) / w52low) * 100;

  const fS = scoreFundamentals(fund);
  const tS = scoreTechnicals({ last, ma50, ma200, rsiVal, d90, d365 });
  const sS = scoreSentiment(fund);
  const validScores = [fS.score, tS.score, sS.score].filter((v): v is number => v != null);
  const composite = validScores.length
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : (tS.score as number);

  let rating: string, ratingClass: "buy" | "hold" | "sell";
  if (composite >= 8) {
    rating = "Buy";
    ratingClass = "buy";
  } else if (composite >= 6.5) {
    rating = "Accumulate";
    ratingClass = "buy";
  } else if (composite >= 4.5) {
    rating = "Hold";
    ratingClass = "hold";
  } else if (composite >= 3) {
    rating = "Reduce";
    ratingClass = "sell";
  } else {
    rating = "Sell";
    ratingClass = "sell";
  }

  const mk = fund?.metrics || ({} as NonNullable<Fundamentals["metrics"]>);

  const keyStats: KeyStat[] = [
    {
      label: "Market Cap",
      value: fund?.profile?.marketCapitalization
        ? "$" + fmtBig(fund.profile.marketCapitalization * 1e6)
        : "—",
    },
    {
      label: "52-Week Range",
      value: "$" + fmt(w52low) + " – $" + fmt(w52high),
      sub: `${fmt(pctFromHigh, 1)}% from high`,
    },
    {
      label: "P/E (TTM)",
      value: mk.peBasicExclExtraTTM != null ? fmt(mk.peBasicExclExtraTTM, 1) : "—",
    },
    {
      label: "Rev Growth YoY",
      value:
        mk.revenueGrowthTTMYoy != null
          ? sign(mk.revenueGrowthTTMYoy) + fmt(mk.revenueGrowthTTMYoy, 1) + "%"
          : "—",
      className: (mk.revenueGrowthTTMYoy ?? 0) > 0 ? "pos" : "neg",
    },
  ];

  const scorecard: ScorecardRow[] = [
    { name: "Fundamentals", score: fS.score, signal: fS.signal },
    { name: "Technicals", score: tS.score, signal: tS.signal },
    { name: "Sentiment / News", score: sS.score, signal: sS.signal },
    { name: "Composite", score: composite, signal: `Rating: ${rating}`, isComposite: true },
  ];

  // —— Prose: Fundamentals ——
  const fundProse: string[] = [];
  if (fund?.profile?.name) {
    const ind = fund.profile.finnhubIndustry ? ` (${fund.profile.finnhubIndustry})` : "";
    fundProse.push(
      `<p><strong>${fund.profile.name}</strong>${ind} trades at <span class="data-inline">$${fmt(last)}</span> with a market capitalization of <span class="data-inline">$${fund.profile.marketCapitalization ? fmtBig(fund.profile.marketCapitalization * 1e6) : "—"}</span>.</p>`,
    );
    let body2 = "<p>";
    if (mk.revenueGrowthTTMYoy != null) {
      const cl = mk.revenueGrowthTTMYoy > 0 ? "pos" : "neg";
      body2 += `Revenue grew <span class="data-inline ${cl}">${sign(mk.revenueGrowthTTMYoy)}${fmt(mk.revenueGrowthTTMYoy, 1)}%</span> year-over-year on a trailing basis. `;
    }
    if (mk.netProfitMarginTTM != null) {
      const cl = mk.netProfitMarginTTM > 0 ? "pos" : "neg";
      body2 += `Trailing net profit margin sits at <span class="data-inline ${cl}">${fmt(mk.netProfitMarginTTM, 1)}%</span>`;
      if (mk.netProfitMarginTTM < 0) body2 += " — the business is not yet GAAP-profitable";
      body2 += ". ";
    }
    if (mk.peBasicExclExtraTTM != null && mk.peBasicExclExtraTTM > 0) {
      body2 += `At a trailing P/E of <span class="data-inline">${fmt(mk.peBasicExclExtraTTM, 1)}</span>, the market is pricing in ${mk.peBasicExclExtraTTM > 30 ? "substantial future growth" : mk.peBasicExclExtraTTM > 15 ? "moderate growth expectations" : "subdued expectations"}. `;
    }
    if (mk["totalDebt/totalEquityAnnual"] != null) {
      const de = mk["totalDebt/totalEquityAnnual"];
      body2 += `The balance sheet carries a debt-to-equity ratio of <span class="data-inline">${fmt(de, 2)}</span>`;
      if (de > 2) body2 += " — elevated leverage worth monitoring";
      else if (de < 0.3) body2 += " — a notably clean capital structure";
      body2 += ".";
    }
    body2 += "</p>";
    fundProse.push(body2);
    if (mk["52WeekHigh"] != null && mk["52WeekLow"] != null) {
      fundProse.push(
        `<p>The 52-week range spans <span class="data-inline">$${fmt(mk["52WeekLow"])}</span> to <span class="data-inline">$${fmt(mk["52WeekHigh"])}</span>. Current price sits <span class="data-inline ${pctFromHigh > -10 ? "pos" : "neg"}">${fmt(pctFromHigh, 1)}%</span> from the high and <span class="data-inline pos">+${fmt(pctFromLow, 0)}%</span> from the low — ${pctFromHigh > -5 ? "the stock is trading near its annual peak" : pctFromHigh > -20 ? "a controlled pullback from recent highs" : "well below its recent peak"}.</p>`,
      );
    }
  } else {
    fundProse.push(
      `<p>Fundamental data for <strong>${sym}</strong> is unavailable right now. Technical analysis below is based on ${rows.length} days of price history.</p>`,
    );
  }

  // —— Prose: Technicals ——
  const techProse: string[] = [];
  let t1 = "<p>";
  if (ma50 && ma200) {
    if (last > ma50 && ma50 > ma200) {
      t1 += `Price sits above both the 50-day (<span class="data-inline">$${fmt(ma50)}</span>) and 200-day (<span class="data-inline">$${fmt(ma200)}</span>) moving averages, with the 50-day itself above the 200-day — a <strong>textbook uptrend structure</strong>. `;
    } else if (last < ma50 && ma50 < ma200) {
      t1 += `Price trades below both the 50-day (<span class="data-inline">$${fmt(ma50)}</span>) and 200-day (<span class="data-inline">$${fmt(ma200)}</span>) moving averages, with the 50-day below the 200-day. Technicians would call this a <strong>confirmed downtrend</strong>. `;
    } else if (last > ma200 && last < ma50) {
      t1 += `Price sits above the 200-day average (<span class="data-inline">$${fmt(ma200)}</span>) but below the 50-day (<span class="data-inline">$${fmt(ma50)}</span>) — a pullback within a larger uptrend, or the early stages of a trend change. `;
    } else {
      t1 += `The moving-average structure is mixed (50-day <span class="data-inline">$${fmt(ma50)}</span>, 200-day <span class="data-inline">$${fmt(ma200)}</span>). No clean trend signal here; the tape is in transition. `;
    }
  }
  if (rsiVal != null) {
    if (rsiVal > 70) t1 += `The 14-day RSI reads <span class="data-inline neg">${fmt(rsiVal, 1)}</span> — overbought territory, with short-term demand having outpaced supply. `;
    else if (rsiVal < 30) t1 += `The 14-day RSI reads <span class="data-inline pos">${fmt(rsiVal, 1)}</span> — oversold. `;
    else t1 += `The 14-day RSI at <span class="data-inline">${fmt(rsiVal, 1)}</span> is in neutral territory. `;
  }
  if (macdVal) {
    const hist = macdVal.hist;
    if (hist > 0) t1 += `MACD histogram is positive at <span class="data-inline pos">+${fmt(hist, 2)}</span>, confirming bullish short-term momentum.`;
    else t1 += `MACD histogram is negative at <span class="data-inline neg">${fmt(hist, 2)}</span>, indicating waning short-term momentum.`;
  }
  t1 += "</p>";
  techProse.push(t1);

  let t2 = "<p>";
  const parts: string[] = [];
  if (d30 != null) parts.push(`30-day return <span class="data-inline ${d30 >= 0 ? "pos" : "neg"}">${sign(d30)}${fmt(d30, 1)}%</span>`);
  if (d90 != null) parts.push(`90-day <span class="data-inline ${d90 >= 0 ? "pos" : "neg"}">${sign(d90)}${fmt(d90, 1)}%</span>`);
  if (d365 != null) parts.push(`1-year <span class="data-inline ${d365 >= 0 ? "pos" : "neg"}">${sign(d365)}${fmt(d365, 1)}%</span>`);
  if (parts.length) t2 += `Performance: ${parts.join(", ")}. `;
  if (dd != null) t2 += `Maximum drawdown over the trailing year reached <span class="data-inline neg">${fmt(dd, 1)}%</span>. `;
  if (vol != null) {
    t2 += `Annualized volatility sits at <span class="data-inline">${fmt(vol, 1)}%</span> — `;
    if (vol > 50) t2 += "<strong>high-vol</strong>; expect meaningful swings and size positions accordingly.";
    else if (vol > 30) t2 += "elevated but not extreme, typical of growth names.";
    else if (vol > 18) t2 += "moderate, in line with broad market averages.";
    else t2 += "<strong>notably low</strong> — this one doesn't move much.";
  }
  t2 += "</p>";
  techProse.push(t2);

  // —— Prose: Sentiment ——
  const sentProse: string[] = [];
  if (fund?.reco && Array.isArray(fund.reco) && fund.reco.length) {
    const r = fund.reco[0];
    const total = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
    let s1 = `<p>As of ${r.period}, <strong>${total} analysts</strong> cover ${sym}: `;
    s1 += `<span class="data-inline pos">${r.strongBuy || 0} Strong Buy</span>, `;
    s1 += `<span class="data-inline pos">${r.buy || 0} Buy</span>, `;
    s1 += `<span class="data-inline">${r.hold || 0} Hold</span>, `;
    s1 += `<span class="data-inline neg">${r.sell || 0} Sell</span>, `;
    s1 += `<span class="data-inline neg">${r.strongSell || 0} Strong Sell</span>. `;
    const bullish = (r.strongBuy || 0) + (r.buy || 0);
    const bearish = (r.sell || 0) + (r.strongSell || 0);
    if (bullish >= total * 0.7) s1 += "The consensus skew is <strong>decisively bullish</strong>. ";
    else if (bullish > bearish) s1 += "The consensus leans positive but is not unanimous. ";
    else if (bearish > bullish) s1 += "The consensus leans negative. ";
    else s1 += "The Street is meaningfully divided. ";
    if (fund.reco.length > 1) {
      const prior = fund.reco[1];
      const priorBullish = (prior.strongBuy || 0) + (prior.buy || 0);
      if (bullish > priorBullish) s1 += "Notably, bullish coverage has expanded versus the prior month.";
      else if (bullish < priorBullish) s1 += "Bullish coverage has contracted versus the prior month — worth watching.";
    }
    s1 += "</p>";
    sentProse.push(s1);

    if (fund.earnings && Array.isArray(fund.earnings) && fund.earnings.length) {
      const e = fund.earnings[0];
      if (e.actual != null && e.estimate != null) {
        const surpriseAbs = e.actual - e.estimate;
        const cl = surpriseAbs > 0 ? "pos" : "neg";
        const verb = surpriseAbs > 0 ? "beat" : "missed";
        sentProse.push(
          `<p>The most recent earnings (${e.period}) ${verb} expectations: actual EPS of <span class="data-inline ${cl}">$${fmt(e.actual)}</span> versus consensus of <span class="data-inline">$${fmt(e.estimate)}</span> (${surpriseAbs > 0 ? "+" : ""}${fmt(surpriseAbs, 2)} surprise). ${e.surprisePercent != null ? `A ${fmt(Math.abs(e.surprisePercent), 1)}% ${surpriseAbs > 0 ? "positive" : "negative"} surprise.` : ""}</p>`,
        );
      }
    }
  } else {
    sentProse.push(`<p>Analyst consensus and news data are unavailable right now.</p>`);
  }

  // —— Prose: Verdict ——
  let verdict = "<p>";
  const strongs: string[] = [];
  if (fS.score != null && fS.score >= 7) strongs.push("fundamentals");
  if ((tS.score as number) >= 7) strongs.push("technicals");
  if (sS.score != null && sS.score >= 7) strongs.push("analyst sentiment");
  const weaks: string[] = [];
  if (fS.score != null && fS.score <= 4) weaks.push("fundamentals");
  if ((tS.score as number) <= 4) weaks.push("technicals");
  if (sS.score != null && sS.score <= 4) weaks.push("sentiment");

  verdict += `The composite rating of <strong>${rating}</strong> (<span class="data-inline">${composite}/10</span>) reflects `;
  if (strongs.length && !weaks.length) verdict += `strength across ${strongs.join(", ")}. `;
  else if (strongs.length && weaks.length) verdict += `tension between strong ${strongs.join(", ")} and weak ${weaks.join(", ")}. `;
  else if (weaks.length) verdict += `concern across ${weaks.join(", ")}. `;
  else verdict += "a middling setup without clear conviction signals. ";

  if (rsiVal != null && rsiVal > 70 && (tS.score as number) >= 7) {
    verdict += `Technically extended — RSI at <span class="data-inline neg">${fmt(rsiVal, 0)}</span> suggests short-term froth. A pullback toward the 50-day (<span class="data-inline">$${fmt(ma50)}</span>) would offer a cleaner entry. `;
  } else if (rsiVal != null && rsiVal < 35 && fS.score != null && fS.score >= 6) {
    verdict += `A potentially attractive entry: quality fundamentals meeting a technically oversold tape. `;
  } else if (ma200 && last < ma200 * 0.9) {
    verdict += `Price is materially below the 200-day average, indicating a broken trend. Wait for structural repair before adding. `;
  }

  if (fS.score != null && fS.score <= 4) verdict += `<strong>Thesis breaks</strong> if profitability continues to deteriorate or the balance sheet weakens further.`;
  else if ((tS.score as number) <= 4) verdict += `<strong>Thesis breaks</strong> if price loses the 200-day average convincingly.`;
  else verdict += `<strong>Thesis breaks</strong> if analyst revisions turn sharply negative or earnings execution falters.`;
  verdict += "</p>";

  // —— Risks ——
  const risks: string[] = [];
  if (mk.netProfitMarginTTM != null && mk.netProfitMarginTTM < 0)
    risks.push(`<strong>Path to profitability.</strong> The business is not yet GAAP-profitable (${fmt(mk.netProfitMarginTTM, 1)}% margin). Extended losses raise dilution and capital-raise risk.`);
  if (mk["totalDebt/totalEquityAnnual"] != null && mk["totalDebt/totalEquityAnnual"] > 1.5)
    risks.push(`<strong>Leverage risk.</strong> Debt-to-equity at ${fmt(mk["totalDebt/totalEquityAnnual"], 2)} is elevated — rising rates or earnings stress could pressure refinancing.`);
  if (rsiVal != null && rsiVal > 70)
    risks.push(`<strong>Short-term exhaustion.</strong> RSI at ${fmt(rsiVal, 0)} is in overbought territory; near-term pullbacks are more likely than continuation.`);
  if (vol != null && vol > 50)
    risks.push(`<strong>Volatility.</strong> Annualized vol of ${fmt(vol, 0)}% means position sizing matters — this stock can move 4-5% intraday on neutral news.`);
  if (ma200 && last < ma200 * 0.9)
    risks.push(`<strong>Broken trend.</strong> Price is materially below the 200-day average — institutional technical rules will keep many buyers sidelined until recovery.`);
  if (fund?.reco && Array.isArray(fund.reco) && fund.reco.length > 1) {
    const cur = fund.reco[0],
      prior = fund.reco[1];
    if ((cur.strongBuy || 0) + (cur.buy || 0) < (prior.strongBuy || 0) + (prior.buy || 0)) {
      risks.push(`<strong>Analyst revisions.</strong> Bullish coverage has contracted month-over-month. A further downgrade cycle would pressure the stock.`);
    }
  }
  if (mk.revenueGrowthTTMYoy != null && mk.revenueGrowthTTMYoy < 0)
    risks.push(`<strong>Top-line contraction.</strong> Revenue is declining year-over-year. Without a return to growth, multiple compression is likely.`);
  if (risks.length < 3) risks.push(`<strong>Macro exposure.</strong> Like all equities, exposed to broad market drawdowns, rate shocks, and regime changes outside company control.`);
  if (risks.length < 3) risks.push(`<strong>Valuation compression.</strong> Multiple expansion has driven gains — a re-rating toward sector averages would cap upside.`);

  // —— Catalysts ——
  const catPoints: string[] = [];
  if (fund?.earnings && Array.isArray(fund.earnings) && fund.earnings.length) {
    catPoints.push(
      `Next quarterly earnings — prior quarter ${fund.earnings[0].actual != null && fund.earnings[0].estimate != null && fund.earnings[0].actual > fund.earnings[0].estimate ? "beat" : "missed"} consensus, so the bar for continuation is set.`,
    );
  }
  if (rsiVal != null && rsiVal > 70) catPoints.push(`Watch for a pullback toward the 50-day ($${fmt(ma50)}) — likely a more attractive re-entry if the structural bull case holds.`);
  if (ma50 && ma200 && ma50 > ma200 && (ma50 - ma200) / ma200 < 0.02) catPoints.push(`Moving averages are converging — a death cross (50d below 200d) would be a material technical event worth tracking.`);
  if (fund?.profile?.finnhubIndustry) catPoints.push(`Sector-level catalysts for ${fund.profile.finnhubIndustry} — macro data, peer earnings, and regulatory developments.`);
  if (!catPoints.length) catPoints.push(`Track the 50-day moving average ($${fmt(ma50)}) as the near-term line in the sand for trend followers.`);
  const catalystHtml =
    "<strong>Next Catalysts to Monitor</strong>" +
    catPoints
      .slice(0, 3)
      .map((p) => `<div style="margin-top:10px">• ${p}</div>`)
      .join("");

  return {
    ticker: sym,
    name: fund?.profile?.name || "U.S.-listed equity",
    industry: [fund?.profile?.finnhubIndustry, fund?.profile?.exchange].filter(Boolean).join(" · ") || "Equity",
    price: "$" + fmt(last),
    changeText: `${sign(d1abs)}${fmt(d1abs)} (${sign(d1pct)}${fmt(d1pct, 2)}%)`,
    changeClassName: d1abs >= 0 ? "pos" : "neg",
    rating,
    ratingClass,
    composite,
    timestamp: `Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    keyStats,
    scorecard,
    proseFundamentalsHtml: fundProse.join(""),
    proseTechnicalsHtml: techProse.join(""),
    proseSentimentHtml: sentProse.join(""),
    proseVerdictHtml: verdict,
    risksHtml: risks.slice(0, 3),
    catalystHtml,
    news,
    rows,
  };
}

export type { Score };
