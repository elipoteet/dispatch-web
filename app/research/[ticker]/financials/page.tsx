import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { buildFinancialsView } from "@/lib/research/financialsView";
import { fiscalYearEndMonth } from "@/lib/research/format";
import { FinancialsView } from "@/components/company/FinancialsView";

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) return { title: "Not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}/financials`;
  const description = `${company.name} (${company.symbol}) financials: ten years of revenue, profit, margins and cash flow, annual and quarterly, from its 10-K and 10-Q filings with the SEC.`;
  return {
    title: `${company.name} (${company.symbol}) financials`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

export default async function FinancialsPage({ params }: Props) {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  // Funds, indexes and anything else without company reports have no
  // Financials tab at all (phase nine: "the SEC tabs don't render"). An
  // unknown ticker is 404'd by the layout; this page bows out alongside it.
  if (!company || !company.filesReports) notFound();

  if (company.financialsUnavailable) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">{company.financialsUnavailable}</p>
      </div>
    );
  }
  const fin = company.financials;
  if (!fin || fin.rows.length === 0) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">The SEC&rsquo;s figures for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
      </div>
    );
  }

  const view = buildFinancialsView({
    rows: fin.rows,
    filerKind: fin.filerKind,
    suppressed: fin.suppression?.items ?? [],
    fiscalYearEnd: company.fiscalYearEnd,
  });
  const month = fiscalYearEndMonth(company.fiscalYearEnd);
  const sourceLine = `Source: ${company.name}'s 10-K and 10-Q filings, from SEC EDGAR${month ? ` · fiscal years end in ${month}` : ""}.`;

  return (
    <div className="rf-tab-body">
      <FinancialsView view={view} sourceLine={sourceLine} suppressionReason={fin.suppression?.reason ?? null} />
    </div>
  );
}
