import { notFound, permanentRedirect } from "next/navigation";
import { TICKER_PATTERN } from "@/lib/ticker";
import { loadCompanyPage } from "@/lib/research/company";
import { CompanyHeader } from "@/components/company/CompanyHeader";
import { ResearchTabs } from "@/components/company/ResearchTabs";

// The research file for one company: header and tabs, shared by every tab.
//
// The ticker is resolved HERE, not in each page, so that /research/nvda and
// every tab under it redirect and 404 identically. And there is deliberately
// no loading.tsx anywhere above this point: a loading boundary puts the
// response into streaming mode before this layout runs, and then
// permanentRedirect() and notFound() can only emit a meta tag with a 200
// status instead of a real 308 or 404 (verified against the old memo route,
// which answered 200 for an unknown ticker for exactly this reason).
export default async function TickerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: raw } = await params;
  const decoded = decodeURIComponent(raw);
  // Canonical URLs are lowercase. /research/NVDA and /research/NVDA/financials
  // both move permanently to the lowercase address.
  if (decoded !== decoded.toLowerCase()) {
    permanentRedirect(`/research/${encodeURIComponent(decoded.toLowerCase())}`);
  }
  const symbol = decoded.toUpperCase();
  if (!TICKER_PATTERN.test(symbol)) notFound();

  const company = await loadCompanyPage(symbol);
  if (!company) notFound();

  // A fund's fiscal year means nothing to a reader of a price chart.
  const fiscalYearEnd = company.filesReports ? company.fiscalYearEnd : null;
  const base = `/research/${company.slug}`;
  const tabs = [{ href: base, label: "Overview" }];
  if (company.filesReports) {
    tabs.push({ href: `${base}/financials`, label: "Financials" });
    tabs.push({ href: `${base}/valuation`, label: "Valuation" });
    tabs.push({ href: `${base}/earnings`, label: "Earnings" });
  }

  return (
    <section className="page active rf" id="page-research">
      <div className="rf-wrap">
        <CompanyHeader
          symbol={company.symbol}
          name={company.name}
          exchange={company.exchange}
          sector={company.sector}
          fiscalYearEnd={fiscalYearEnd}
          quote={company.quote}
          range52={company.range52}
        />
        <ResearchTabs tabs={tabs} />
        {children}
        <p className="rf-footer-note">
          Data: SEC EDGAR · Twelve Data · Finnhub. Facts and figures, not investment advice. The Dispatch doesn&rsquo;t rate stocks
          or put a price on them.
        </p>
      </div>
    </section>
  );
}
