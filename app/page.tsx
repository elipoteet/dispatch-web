import type { Metadata } from "next";
import Link from "next/link";
import { CompanySearch } from "@/components/company/CompanySearch";
import { getHomeCards } from "@/lib/research/home";

// The front door to the research files (docs/phase-nine.md, "The home page").
// Search first; then what a file holds; example companies with one fact each
// from their filings; the tools; and three lines on how the site works.
// No live prices anywhere on this page.

export const metadata: Metadata = {
  title: { absolute: "The Dispatch — Free research on every U.S. public company" },
  description:
    "A free research file on every U.S. public company, read from its SEC filings: ten years of financials, what stands out, and its price history. No ratings, no verdicts.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const EXAMPLE = "nvda";

const FILE_SECTIONS: { label: string; text: string; href?: string }[] = [
  { label: "Overview", text: "What the company does, what stands out in its numbers, and its price.", href: `/research/${EXAMPLE}` },
  { label: "Financials", text: "Ten years of revenue, profit, margins and cash flow, annual and quarterly.", href: `/research/${EXAMPLE}/financials` },
  { label: "Valuation", text: "The growth today’s price assumes, its yields, and its multiples against ten years of its own history.", href: `/research/${EXAMPLE}/valuation` },
  { label: "Earnings", text: "Quarterly results, the next report date, and the company’s own guidance.", href: `/research/${EXAMPLE}/earnings` },
  { label: "Insiders", text: "Shares bought and sold by executives and directors, from Form 4 filings." },
  { label: "Filings", text: "Every report, and what changed in the risk factors from one year to the next." },
];

export default async function HomePage() {
  const cards = await getHomeCards();

  return (
    <section className="page active rf" id="page-home">
      <div className="rf-wrap">
        <div className="rf-hero">
          <div className="rf-lbl">Free · from SEC filings · no ratings</div>
          <h1 className="rf-hero-title">A research file on every U.S. public company.</h1>
          <p className="rf-hero-lede">
            Read straight from the reports companies file with the SEC: ten years of financials, what stands out in them, and the
            price history. Facts to think with, not a verdict to follow.
          </p>
          <CompanySearch placeholder="Search a ticker or company name, like NVDA or Costco" />
        </div>

        <div className="rf-home-section">
          <div className="rf-lbl">What&rsquo;s in a file</div>
          <div className="rf-file-grid">
            {FILE_SECTIONS.map((s) =>
              s.href ? (
                <Link key={s.label} href={s.href} className="rf-file-card" prefetch={false}>
                  <span className="rf-file-name">{s.label}</span>
                  <span className="rf-file-text">{s.text}</span>
                  <span className="rf-lbl rf-file-cta">See NVIDIA&rsquo;s →</span>
                </Link>
              ) : (
                <div key={s.label} className="rf-file-card is-coming">
                  <span className="rf-file-name">{s.label}</span>
                  <span className="rf-file-text">{s.text}</span>
                  <span className="rf-lbl rf-file-cta">Coming</span>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="rf-home-section">
          <div className="rf-lbl">Start with a company</div>
          <div className="rf-company-grid">
            {cards.map((c) => (
              // No prefetch: prefetching a company page loads its data, so six
              // cards in view would cost up to six Twelve Data requests a day
              // from visits that never click. Found when a screenshot of this
              // page fetched and stored Apple and Costco without a click.
              <Link key={c.symbol} href={`/research/${c.slug}`} className="rf-company-card" prefetch={false}>
                <span className="rf-company-head">
                  <span className="rf-company-name">{c.name}</span>
                  <span className="rf-ticker">{c.symbol}</span>
                </span>
                {c.sector && <span className="rf-lbl">{c.sector}</span>}
                {c.fact && <span className="rf-company-fact">{c.fact}</span>}
              </Link>
            ))}
          </div>
        </div>

        <div className="rf-home-section">
          <div className="rf-lbl">Tools</div>
          <div className="rf-tools">
            <Link href="/portfolio" className="rf-tool">
              <span className="rf-file-name">Portfolio simulator</span>
              <span className="rf-file-text">Practice with paper money, in an amount you choose. Trade from any company&rsquo;s page.</span>
            </Link>
            <div className="rf-tool is-coming">
              <span className="rf-file-name">Screener</span>
              <span className="rf-file-text">Filter every filer by growth, margins, cash flow and size.</span>
              <span className="rf-lbl rf-file-cta">Coming</span>
            </div>
            <div className="rf-tool is-coming">
              <span className="rf-file-name">Compare</span>
              <span className="rf-file-text">Two companies&rsquo; files side by side.</span>
              <span className="rf-lbl rf-file-cta">Coming</span>
            </div>
          </div>
        </div>

        <div className="rf-home-section rf-how">
          <div className="rf-lbl">How it works</div>
          <ul className="rf-how-list">
            <li>The numbers come from companies&rsquo; own filings with the SEC, and every page links back to the source.</li>
            <li>Nothing here rates a stock, scores it or puts a price on it. The judgment stays yours.</li>
            <li>It&rsquo;s free, with no account needed to read anything.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
