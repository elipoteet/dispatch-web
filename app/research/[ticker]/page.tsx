import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { whatStandsOut } from "@/lib/research/standsOut";
import { keyStats } from "@/lib/research/keyStats";
import { descriptionToShow, generateDescription, needsDescription, readDescription } from "@/lib/research/description";
import { filingDocumentUrl } from "@/lib/sec/client";
import { chartSeries } from "@/lib/analysis/tickerChart";
import { fyShort } from "@/lib/research/format";
import { PriceChart } from "@/components/company/PriceChart";

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ asOf?: string }>;
};

// Room for the "In its own words" quote to be read after the response has
// gone: one 10-K download. The page itself never waits on it.
export const maxDuration = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  // The layout 404s an unknown ticker; this only has to avoid throwing first.
  if (!company) return { title: "Company not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}`;
  const description = company.filesReports
    ? `${company.name} (${company.symbol}): price, ten years of reported financials and what stands out, from its SEC filings. Free, with no ratings.`
    : `${company.name} (${company.symbol}): price history. Free, with no ratings.`;
  return {
    title: `${company.name} (${company.symbol}) overview`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

export default async function OverviewPage({ params, searchParams }: Props) {
  const { ticker } = await params;
  const { asOf } = await searchParams;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  // Old Time Machine links (?asOf=) land on today's file. The Time Machine
  // isn't part of the research file.
  if (asOf !== undefined) permanentRedirect(`/research/${encodeURIComponent(symbol.toLowerCase())}`);

  // Already loaded by the layout; cache() makes this free. The layout 404s an
  // unknown ticker, but the page renders alongside it, so it bows out too.
  const company = await loadCompanyPage(symbol);
  if (!company) notFound();
  const fin = company.financials;

  const read = fin ? await readDescription(fin.cik) : null;
  const scheduled = Boolean(fin && read && needsDescription(read, fin.latestAnnual));
  if (fin && scheduled) {
    const filing = fin.latestAnnual!;
    after(() => generateDescription(fin.cik, filing));
  }
  const described = read ? descriptionToShow(read) : null;

  const standsOut = fin
    ? whatStandsOut({
        rows: fin.rows,
        filerKind: fin.filerKind,
        fiscalYearEnd: company.fiscalYearEnd,
        price: company.quote?.price ?? null,
        range52: company.range52,
      })
    : null;

  const stats = keyStats({
    rows: fin?.rows ?? [],
    filerKind: fin?.filerKind ?? "operating",
    price: company.quote?.price ?? null,
    sharesOutstandingMillions: company.profile?.sharesOutstandingMillions ?? null,
    marketCapMillions: company.profile?.marketCapMillions ?? null,
    averageVolume: company.avgVolume,
  });

  const series = company.daily ? chartSeries(company.daily) : null;
  // Finnhub's previous close belongs to the session of its last trade, given
  // here as that session's New York date so the 1D chart can check it's
  // drawing the same day.
  const previousClose =
    company.quote && company.quote.asOf > 0
      ? {
          value: company.quote.previousClose,
          session: new Date(company.quote.asOf * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
          last: company.quote.price,
        }
      : null;
  const annualUrl = fin?.latestAnnual?.primaryDocument ? filingDocumentUrl(fin.cik, fin.latestAnnual) : null;
  // The left column only renders when it has something to say; otherwise
  // "What stands out" takes the full width instead of sitting beside a gap.
  // The quote appears from the second visit on (it is read after the first
  // response is sent), so nothing is shown while it's pending.
  const hasBrief = Boolean(described || company.financialsUnavailable || !fin);

  return (
    <div className="rf-tab-body">
      {company.filesReports && (
        <div className="rf-overview-top">
          {hasBrief && <div className="rf-brief">
            {described ? (
              <>
                <div className="rf-lbl">In its own words</div>
                <blockquote className="rf-brief-text">&ldquo;{described.description}&rdquo;</blockquote>
                <p className="rf-ai-label">
                  {`How ${company.name} describes itself at the start of the business section of its latest ${described.sourceForm}, lightly trimmed. The company's words, not The Dispatch's.`}{" "}
                  {annualUrl && (
                    <a href={annualUrl} target="_blank" rel="noopener noreferrer">
                      Read the filing
                    </a>
                  )}
                </p>
              </>
            ) : null}
            {company.financialsUnavailable && <p className="rf-note">{company.financialsUnavailable}</p>}
            {!fin && !company.financialsUnavailable && (
              <p className="rf-note">The SEC&rsquo;s figures for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
            )}
          </div>}

          {standsOut && standsOut.facts.length > 0 && (
            <aside className="rf-standout">
              <div className="rf-lbl">What stands out</div>
              {standsOut.facts.map((f) => (
                <p key={f.id} className="rf-standout-fact">
                  {f.text}
                </p>
              ))}
              <div className="rf-lbl rf-standout-foot">
                Facts, not a verdict · from its filings{standsOut.fiscalYear ? ` through ${fyShort(standsOut.fiscalYear)}` : ""}
              </div>
            </aside>
          )}
        </div>
      )}

      {!company.filesReports && (
        <p className="rf-note">
          {`${company.symbol} doesn’t file company reports with the SEC (it may be a fund or another kind of security), so this page shows its price only.`}
        </p>
      )}

      {stats.length > 0 && (
        <div className="rf-stats">
          {stats.map((s) => (
            <div className="rf-stat" key={s.id}>
              <span className="rf-lbl">{s.label}</span>
              <span className="rf-stat-value">{s.value}</span>
              <span className="rf-stat-note">{s.note}</span>
            </div>
          ))}
        </div>
      )}

      {series && series.daily.length >= 2 ? (
        <PriceChart
          symbol={company.symbol}
          daily={series.daily}
          weekly={series.weekly}
          earnings={company.earnings}
          nextEarnings={company.nextEarnings}
          previousClose={previousClose}
        />
      ) : (
        <div className="rf-chart-pending">The price chart is updating. Try again in a minute.</div>
      )}
    </div>
  );
}
