// The home page's example companies. Server-only.
//
// Read from what is already stored, never fetched: a company appears here with
// a fact once its page has been opened at least once, and without one before
// that. No live prices either: six quote calls per home-page visit would spend
// provider allowances on a page nobody came to for prices.

import { unstable_cache } from "next/cache";
import { lookupCik } from "@/lib/sec/client";
import { getStoredCompany, getStoredFinancials } from "@/lib/sec/store";
import { fetchCompanyProfile } from "@/lib/providers";
import { whatStandsOut } from "@/lib/research/standsOut";
import { titleCaseName } from "@/lib/research/format";

// Across sectors, with one bank so the honest-gaps handling (no gross margin
// or free cash flow for a bank) shows on the way in.
export const HOME_EXAMPLES = ["NVDA", "AAPL", "COST", "CVX", "KO", "JPM"];

export type HomeCard = { symbol: string; slug: string; name: string; sector: string | null; fact: string | null };

async function getHomeCardsRaw(): Promise<HomeCard[]> {
  return Promise.all(
    HOME_EXAMPLES.map(async (symbol): Promise<HomeCard> => {
      const [ref, profile] = await Promise.all([lookupCik(symbol), fetchCompanyProfile(symbol)]);
      const stored = ref ? await getStoredCompany(ref.cik) : null;
      let fact: string | null = null;
      if (stored) {
        // Full-year rows only: every rule that can lead is an annual one.
        const rows = await getStoredFinancials(stored.cik, { period: "FY" });
        fact = whatStandsOut({ rows, filerKind: stored.filerType, fiscalYearEnd: stored.fiscalYearEnd }, 1).facts[0]?.text ?? null;
      }
      return {
        symbol,
        slug: symbol.toLowerCase(),
        name: profile?.name ?? (ref ? titleCaseName(ref.name) : symbol),
        sector: profile?.industry ?? (stored?.sicDescription ? titleCaseName(stored.sicDescription) : null),
        fact,
      };
    }),
  );
}

// An hour: long enough that the home page is effectively free, short enough
// that a company opened for the first time shows its fact the same afternoon.
// The example list is part of the key, so changing it can never serve an
// hour of the old list from cache.
const cachedHomeCards = unstable_cache(getHomeCardsRaw, ["homeCards", HOME_EXAMPLES.join(",")], { revalidate: 60 * 60 });

export async function getHomeCards(): Promise<HomeCard[]> {
  try {
    return await cachedHomeCards();
  } catch {
    return HOME_EXAMPLES.map((symbol) => ({ symbol, slug: symbol.toLowerCase(), name: symbol, sector: null, fact: null }));
  }
}
