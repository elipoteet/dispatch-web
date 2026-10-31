import type { Metadata } from "next";
import { CompanySearch } from "@/components/company/CompanySearch";

// An unknown ticker: notFound() from app/research/[ticker]/layout.tsx lands
// here, since a layout's own not-found boundary sits inside it.
//
// noindex set explicitly: Next's automatic noindex for notFound() was found
// not to apply reliably once a custom not-found.tsx exists (gotcha 2).
export const metadata: Metadata = {
  title: "Ticker not found",
  robots: { index: false, follow: false },
};

export default function ResearchNotFound() {
  return (
    <section className="page active rf" id="page-research">
      <div className="rf-wrap rf-narrow">
        <div className="rf-lbl">Research</div>
        <h1 className="rf-page-title">We couldn&rsquo;t find that ticker.</h1>
        <p className="rf-page-lede">
          Check the symbol, or search by company name. Every company that files with the SEC has a research file here.
        </p>
        <CompanySearch />
      </div>
    </section>
  );
}
