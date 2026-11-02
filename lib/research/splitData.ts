// Stock-split factors for a company, shared by the Valuation and Earnings
// tabs. Server-only.
//
// One Twelve Data request (unadjusted daily closes, cached a day and shared by
// both tabs), spent only when the company's share counts jumped in the last
// ten years, which is what a split looks like in its filings (splits.ts,
// needsSplitCheck). Everyone else gets no steps, meaning no splits.

import { unstable_cache } from "next/cache";
import { fetchUnadjustedDailyCloses, TwelveDataBusyError } from "@/lib/providers";
import type { CompanyPage } from "@/lib/research/company";
import { needsSplitCheck, splitSteps, type SplitStep } from "@/lib/research/splits";
import { shareCountsInWindow } from "@/lib/research/valuation";

// Unadjusted prices never change once traded, so a day-old copy is only
// missing the newest sessions. ~100KB for twelve years.
const cachedUnadjusted = unstable_cache(
  async (symbol: string) => fetchUnadjustedDailyCloses(symbol),
  ["unadjustedDaily", "3000"],
  { revalidate: 60 * 60 * 24 },
);

// ok: steps are known (empty when there was no split). busy: Twelve Data's
// allowance is used up for the minute. unavailable: no price history to
// compare against, or the request failed.
export type SplitStatus = "ok" | "busy" | "unavailable";

export async function loadSplitSteps(
  company: CompanyPage,
  finnhubShares: number | null,
  asOf: string,
): Promise<{ steps: SplitStep[] | null; status: SplitStatus }> {
  const rows = company.financials?.rows ?? [];
  if (!needsSplitCheck(shareCountsInWindow(rows, asOf), finnhubShares)) return { steps: [], status: "ok" };
  if (!company.daily) return { steps: null, status: "unavailable" };
  try {
    const raw = await cachedUnadjusted(company.symbol);
    return { steps: splitSteps(raw, company.daily), status: "ok" };
  } catch (err) {
    if (err instanceof TwelveDataBusyError) return { steps: null, status: "busy" };
    console.error(`[splits] ${company.symbol}: split check failed:`, err instanceof Error ? err.message : err);
    return { steps: null, status: "unavailable" };
  }
}
