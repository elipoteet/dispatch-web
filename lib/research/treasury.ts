// The 10-year Treasury yield, shown on the Valuation tab for scale beside the
// company's own yields. From the Treasury's free daily yield-curve file, which
// needs no key: a CSV per year, newest day first (checked November 2026:
// 4.94% on 30 October). Cached a day.

import { unstable_cache } from "next/cache";

export type TreasuryYield = { date: string; percent: number };

function csvUrl(year: number): string {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
}

// "10/30/2026" -> "2026-10-30".
function isoDate(us: string): string | null {
  const m = us.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

// The newest day's 10-year yield. The column is found by its header rather
// than its position, since the Treasury has added maturities before (the
// 1.5-month and 4-month columns are recent).
export function parseTenYear(csv: string): TreasuryYield | null {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const col = header.indexOf("10 Yr");
  if (col < 0) return null;
  let best: TreasuryYield | null = null;
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = isoDate(cells[0] ?? "");
    const percent = Number(cells[col]);
    if (!date || !cells[col]?.trim() || !Number.isFinite(percent)) continue;
    if (!best || date > best.date) best = { date, percent };
  }
  return best;
}

async function fetchTenYearRaw(): Promise<TreasuryYield> {
  // Early in January this year's file has no rows yet; last year's has the
  // newest figure until the first trading day.
  const year = new Date().getUTCFullYear();
  for (const y of [year, year - 1]) {
    const res = await fetch(csvUrl(y), { cache: "no-store" });
    if (!res.ok) continue;
    const parsed = parseTenYear(await res.text());
    if (parsed) return parsed;
  }
  // Thrown, not returned, so the day-long cache never keeps a failure.
  throw new Error("Treasury yield curve unavailable");
}

const cachedTenYear = unstable_cache(fetchTenYearRaw, ["treasury10y", "v1"], { revalidate: 60 * 60 * 24 });

export async function getTenYearTreasury(): Promise<TreasuryYield | null> {
  try {
    return await cachedTenYear();
  } catch {
    return null;
  }
}
