import type { Metadata } from "next";
import Link from "next/link";
import { CompanySearch } from "@/components/company/CompanySearch";
import { RecentlyViewed } from "@/components/company/RecentlyViewed";
import { getHomeCards } from "@/lib/research/home";
import { shortName } from "@/lib/research/format";
import { getMarketsStrip } from "@/lib/research/markets";
import { MarketsTape } from "@/components/home/MarketsTape";

// The front door to the research files, laid out as the Home board in
// docs/design/phase-ten/Home.dc.html. Search first; then the markets tape (the
// old site's, from a shared Finnhub cache: lib/research/markets.ts); the
// visitor's recently viewed companies, from their own browser after the page
// loads; example companies with one fact each from their filings; what a file
// holds; the tools to come; and how it works.

export const metadata: Metadata = {
  title: { absolute: "The Dispatch — Free research on every U.S. public company" },
  description:
    "A free research file on every U.S. public company, read from its SEC filings: ten years of financials, what stands out, and its price history. No ratings, no verdicts.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const EXAMPLE = "nvda";

const FILE_SECTIONS: { label: string; text: string; href: string }[] = [
  { label: "Overview", text: "What the company does, what stands out in its numbers, and its price.", href: `/research/${EXAMPLE}` },
  { label: "Financials", text: "Ten years of revenue, profit, margins and cash flow, annual and quarterly.", href: `/research/${EXAMPLE}/financials` },
  { label: "Valuation", text: "The growth today’s price assumes, its yields, and its multiples against ten years of its own history.", href: `/research/${EXAMPLE}/valuation` },
  { label: "Earnings", text: "Quarterly results, the next report date, and the company’s own outlook.", href: `/research/${EXAMPLE}/earnings` },
  { label: "Insiders", text: "Shares bought and sold by executives and directors, from their Form 4 filings.", href: `/research/${EXAMPLE}/insiders` },
  { label: "Filings", text: "Every report, and what changed in the risk factors from one year to the next.", href: `/research/${EXAMPLE}/filings` },
];

export default async function HomePage() {
  const [cards, tape] = await Promise.all([getHomeCards(), getMarketsStrip()]);

  return (
    <section className="page active rf" id="page-home">
      <div className="rf-wrap rf-wrap-top">
        <div className="rf-hero">
          <div className="rf-lbl rf-kicker">Free · from SEC filings · no ratings</div>
          <h1 className="rf-hero-title">A research file on every U.S. public company.</h1>
          <p className="rf-hero-lede">
            Read straight from the reports companies file with the SEC: ten years of financials, what stands out in them, insider
            trades, what changed in the risk factors, and the price history. Facts to think with, not a verdict to follow.
          </p>
          <CompanySearch placeholder="Search a ticker or company, like NVDA or Costco" />
          <div className="rf-quick">
            <span className="rf-lbl">Try</span>
            {cards.slice(0, 4).map((c) => (
              <Link key={c.symbol} href={`/research/${c.slug}`} prefetch={false}>
                {shortName(c.name)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Edge to edge, as the old tape was. */}
      {tape && <MarketsTape tape={tape} />}

      <div className="rf-wrap">
        <RecentlyViewed />

        <section className="rf-home-section" aria-labelledby="rf-home-start">
          <div>
            <div className="rf-lbl rf-kicker">Start with a company</div>
            <h2 className="rf-h2" id="rf-home-start">
              One fact from each file
            </h2>
          </div>
          <div className="rf-company-grid">
            {cards.map((c) => (
              // No prefetch: prefetching a company page loads its data, so six
              // cards in view would cost up to six Twelve Data requests a day
              // from visits that never click. Found when a screenshot of this
              // page fetched and stored Apple and Costco without a click.
              <Link key={c.symbol} href={`/research/${c.slug}`} className="rf-company-card" prefetch={false}>
                <span className="rf-company-head">
                  <span className="rf-company-name">{shortName(c.name)}</span>
                  <span className="rf-ticker">{c.symbol}</span>
                </span>
                {c.sector && <span className="rf-lbl">{c.sector}</span>}
                {c.fact && <span className="rf-company-fact">{c.fact}</span>}
              </Link>
            ))}
          </div>
        </section>

        <section className="rf-home-section" aria-labelledby="rf-home-file">
          <div>
            <div className="rf-lbl rf-kicker">What&rsquo;s in a file</div>
            <h2 className="rf-h2" id="rf-home-file">
              Six tabs, one company
            </h2>
            <p className="rf-dek">Each opens NVIDIA&rsquo;s, as an example.</p>
          </div>
          <div className="rf-file-grid">
            {FILE_SECTIONS.map((s, i) => (
              <Link key={s.label} href={s.href} className="rf-file-card" prefetch={false}>
                <span className="rf-file-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="rf-file-name">{s.label}</span>
                <span className="rf-file-text">{s.text}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rf-home-section" aria-labelledby="rf-home-tools">
          <div>
            <div className="rf-lbl rf-kicker">Coming next</div>
            <h2 className="rf-h2" id="rf-home-tools">
              Tools
            </h2>
          </div>
          <div className="rf-tools">
            <div className="rf-tool">
              <span className="rf-lbl">Coming</span>
              <span className="rf-file-name">Screener</span>
              <span className="rf-file-text">Filter every filer by growth, margins, cash flow and size.</span>
            </div>
            <div className="rf-tool">
              <span className="rf-lbl">Coming</span>
              <span className="rf-file-name">Compare</span>
              <span className="rf-file-text">Two companies side by side, from the same filings.</span>
            </div>
          </div>
        </section>

        <section className="rf-home-section" aria-labelledby="rf-home-how">
          <div>
            <div className="rf-lbl rf-kicker">How it works</div>
            <h2 className="rf-h2" id="rf-home-how">
              Three things to know
            </h2>
          </div>
          <ol className="rf-how-list">
            <li>
              <strong>Straight from the SEC.</strong>
              <span>Every figure comes from the reports companies file with the SEC, and every page links back to the source. Where we calculate something, the page says so.</span>
            </li>
            <li>
              <strong>Free, for everyone.</strong>
              <span>No account needed to read anything. Your recently viewed companies stay on your own device.</span>
            </li>
            <li>
              <strong>No verdicts.</strong>
              <span>Nothing here rates a stock, scores it or puts a price on it. The judgment stays yours.</span>
            </li>
          </ol>
        </section>

      </div>
    </section>
  );
}
