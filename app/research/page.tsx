import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CompanySearch } from "@/components/company/CompanySearch";
import { RecentlyViewed } from "@/components/company/RecentlyViewed";
import { HOME_EXAMPLES } from "@/lib/research/home";

// The research desk: search, and the visitor's recently viewed companies.
// Stage 8 adds the screener's way in.
export const metadata: Metadata = {
  title: "Research",
  description: "Search any U.S. public company by ticker or name and open its free research file, built from its SEC filings.",
  alternates: { canonical: "/research" },
  openGraph: { url: "/research" },
};

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  // Old shareable form (?ticker=NVDA) goes to the company's own address.
  if (ticker && ticker.trim()) redirect(`/research/${encodeURIComponent(ticker.trim().toLowerCase())}`);

  return (
    <section className="page active rf" id="page-research">
      <div className="rf-wrap rf-narrow">
        <div className="rf-lbl rf-kicker">Research</div>
        <h1 className="rf-page-title">Open a company&rsquo;s file.</h1>
        <p className="rf-page-lede">
          Search by ticker or company name. Every company that files with the SEC has a file: what it does, what stands out, ten
          years of financials and its price.
        </p>
        <CompanySearch autoFocus />
        <div className="rf-quick">
          <span className="rf-lbl">Try</span>
          {HOME_EXAMPLES.map((s) => (
            <Link key={s} href={`/research/${s.toLowerCase()}`} className="rf-chip" prefetch={false}>
              {s}
            </Link>
          ))}
        </div>
        <RecentlyViewed />
      </div>
    </section>
  );
}
