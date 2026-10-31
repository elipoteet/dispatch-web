// The Overview's key-stats grid. Pure, so every figure is unit-tested.
//
// Reported figures come from the SEC rows; the three that need a price (market
// value, P/E, volume) combine them with Finnhub's quote and profile and the
// daily price history. Each stat carries a one-line plain-English note, as in
// the mockup, so a first-year student never meets an unexplained ratio.

import type { FilerKind } from "@/lib/sec/concepts";
import type { FinancialRow } from "@/lib/sec/normalize";
import { FinancialSeries } from "@/lib/research/series";
import { formatCount, formatMoney, formatPct, formatSignedPct, fyShort } from "@/lib/research/format";

export type KeyStat = { id: string; label: string; value: string; note: string };

export type KeyStatsInput = {
  rows: FinancialRow[];
  filerKind: FilerKind;
  price: number | null;
  sharesOutstandingMillions: number | null;
  marketCapMillions: number | null;
  averageVolume: number | null;
};

// Price times shares outstanding. Finnhub's share count is the current one,
// which is what "market value today" needs; its own market-cap figure is the
// fallback when the share count is missing.
export function marketValue(input: Pick<KeyStatsInput, "price" | "sharesOutstandingMillions" | "marketCapMillions">): number | null {
  if (input.price && input.sharesOutstandingMillions) return input.price * input.sharesOutstandingMillions * 1e6;
  if (input.marketCapMillions) return input.marketCapMillions * 1e6;
  return null;
}

export function keyStats(input: KeyStatsInput): KeyStat[] {
  const s = new FinancialSeries(input.rows);
  const year = s.latestFiscalYear();
  const stats: KeyStat[] = [];
  const mv = marketValue(input);

  if (mv) stats.push({ id: "market-value", label: "Market value", value: formatMoney(mv), note: "Shares × price" });

  if (mv) {
    const ttm = s.trailingTwelveMonths("net_income");
    if (ttm && ttm.value > 0) {
      stats.push({ id: "pe", label: "P/E", value: (mv / ttm.value).toFixed(1), note: "Price ÷ last 12 months’ earnings" });
    } else if (ttm) {
      stats.push({ id: "pe", label: "P/E", value: "—", note: "Not meaningful: a loss over the last 12 months" });
    }
  }

  if (year != null) {
    const revenue = s.annual("revenue", year);
    if (revenue != null) {
      const prior = s.annual("revenue", year - 1);
      stats.push({
        id: "revenue",
        label: `Revenue ${fyShort(year)}`,
        value: formatMoney(revenue),
        note: prior && prior > 0 ? `${formatSignedPct(((revenue - prior) / prior) * 100)} on the year` : "Full fiscal year",
      });
    }

    const netMargin = s.margin("net_income", year);
    if (netMargin != null) {
      stats.push({ id: "net-margin", label: "Net margin", value: formatPct(netMargin * 100), note: "Profit kept per dollar of sales" });
    }

    if (input.filerKind === "operating") {
      const gm = s.grossMargin(year);
      if (gm != null) {
        const before = s.grossMargin(year - 1);
        let note = "Sales left after the cost of making them";
        if (before != null) {
          const diff = Number(((gm - before) * 100).toFixed(1));
          note = diff < 0 ? `Down from ${formatPct(before * 100)}` : diff > 0 ? `Up from ${formatPct(before * 100)}` : "Unchanged on the year";
        }
        stats.push({ id: "gross-margin", label: "Gross margin", value: formatPct(gm * 100), note });
      }

      const fcf = s.annual("free_cash_flow", year);
      if (fcf != null) {
        stats.push({ id: "fcf", label: "Free cash flow", value: formatMoney(fcf), note: "Cash left after investment (calculated)" });
      }
    } else {
      // Banks and insurers: no gross margin or free cash flow, so show the size
      // of the balance sheet, which is the business.
      const assets = s.annual("total_assets", year);
      if (assets != null) {
        stats.push({ id: "assets", label: `Total assets ${fyShort(year)}`, value: formatMoney(assets), note: "Everything it owns, at year end" });
      }
    }

    const repurchased = s.annual("buybacks", year);
    if (repurchased != null && repurchased > 0) {
      stats.push({
        id: "repurchases",
        label: `Repurchases ${fyShort(year)}`,
        value: formatMoney(repurchased),
        note: "Cash spent retiring its own shares",
      });
    }
  }

  if (input.averageVolume) {
    stats.push({ id: "volume", label: "Avg volume", value: formatCount(input.averageVolume), note: "Shares traded a day, last 3 months" });
  }

  return stats;
}
