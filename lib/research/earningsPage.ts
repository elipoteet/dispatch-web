// Everything the Earnings tab shows. Server-only.
//
// From the company page (already loaded): the SEC rows and Finnhub's next
// report date with its estimates. Read here: the last five earnings releases,
// for the company's own revenue outlook (two SEC requests each the first time
// anyone looks, then kept for good), Finnhub's reported-against-estimate EPS
// for the last four quarters, and the company's stock splits, to put EPS on
// one share basis. That last is the one Twelve Data request this tab can
// cost, only for a company whose share counts jumped, and shared for a day
// with the Valuation tab.

import { getSubmissions, earningsReleaseFilings } from "@/lib/sec/client";
import { readEarningsRelease } from "@/lib/sec/releases";
import { fetchEarningsSurprises, type NextEarnings } from "@/lib/providers";
import type { CompanyPage } from "@/lib/research/company";
import { loadSplitSteps, type SplitStatus } from "@/lib/research/splitData";
import { finnhubShareCount, quarterList } from "@/lib/research/valuation";
import {
  earningsQuarters,
  estimateSentence,
  followsLast,
  nextQuarter,
  outlooks,
  quarterLabel,
  reportedQuarter,
  upcomingOutlook,
  type EarningsQuarter,
  type Guided,
  type ReadRelease,
} from "@/lib/research/earnings";

export const RELEASES_READ = 5;

export type EstimateRow = {
  label: string;
  actual: number;
  estimate: number;
  sentence: string;
};

export type EarningsData = {
  // Whether EPS could be put on one share basis (see earningsQuarters). When
  // it couldn't, the EPS chart says so instead of mixing share sizes.
  epsStatus: SplitStatus;
  next: NextEarnings | null;
  // The quarter being reported next, in the company's own labels.
  nextLabel: string | null;
  // The company's outlook for it, from its newest release, if it gave one.
  upcoming: Guided | null;
  // Whether that quarter directly follows the last one charted. Not while the
  // 10-Q for the quarter just reported is still to come: a bar for the next
  // quarter would then skip one.
  upcomingInChart: boolean;
  newestRelease: { filed: string; url: string | null } | null;
  quarters: EarningsQuarter[];
  estimates: EstimateRow[] | null;
};

export async function loadEarnings(company: CompanyPage): Promise<EarningsData | null> {
  const fin = company.financials;
  if (!fin || fin.rows.length === 0 || !company.cik) return null;

  const submissions = await getSubmissions(company.cik);
  const filings = submissions ? earningsReleaseFilings(submissions, RELEASES_READ) : [];
  const asOf = new Date().toISOString().slice(0, 10);
  const finnhubShares = finnhubShareCount(company.profile, company.quote?.price ?? null);
  const [readings, surprises, split] = await Promise.all([
    Promise.all(filings.map((f) => readEarningsRelease(company.cik!, f.accession))),
    fetchEarningsSurprises(company.symbol),
    loadSplitSteps(company, finnhubShares, asOf),
  ]);
  const releases: ReadRelease[] = filings.flatMap((f, i) =>
    readings[i] ? [{ filed: f.filed, url: readings[i]!.url, candidates: readings[i]!.candidates }] : [],
  );

  const guided = outlooks(releases, fin.rows);
  const quarters = earningsQuarters(fin.rows, guided, company.fiscalYearEnd, split.steps);
  const upcoming = upcomingOutlook(guided, filings[0] ?? null);

  // The quarter the next report covers: the one after the newest release's.
  // Not the one after the newest filed quarter, which lags the release by
  // weeks (JPMorgan's next report is its fourth quarter, though its 10-Q for
  // the third wasn't filed yet). Finnhub's calendar is the fallback.
  const newestReported = filings[0] ? reportedQuarter(filings[0].filed, quarterList(fin.rows)) : null;
  const last = quarters[quarters.length - 1];
  const n = company.nextEarnings;
  const nextQ = newestReported
    ? nextQuarter(newestReported)
    : n?.fiscalYear && n.fiscalQuarter && n.fiscalQuarter >= 1 && n.fiscalQuarter <= 4
      ? { fiscalYear: n.fiscalYear, quarter: n.fiscalQuarter }
      : last
        ? nextQuarter({ fiscalYear: last.fiscalYear, fiscalPeriod: `Q${last.quarter}` })
        : null;

  return {
    epsStatus: split.status,
    next: company.nextEarnings,
    nextLabel: nextQ ? quarterLabel(nextQ.fiscalYear, nextQ.quarter, company.fiscalYearEnd) : null,
    upcoming,
    upcomingInChart: Boolean(upcoming && followsLast(upcoming, quarters)),
    newestRelease: filings[0] ? { filed: filings[0].filed, url: readings[0]?.url ?? null } : null,
    quarters,
    estimates: surprises
      ? surprises.slice(0, 4).map((s) => ({
          label: quarterLabel(s.fiscalYear, s.fiscalQuarter, company.fiscalYearEnd),
          actual: s.actual,
          estimate: s.estimate,
          sentence: estimateSentence(s.actual, s.estimate),
        }))
      : null,
  };
}
