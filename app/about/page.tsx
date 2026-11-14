import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "The Dispatch is a free research file on every U.S. public company, built from what each company reports to the SEC. No account, no paywall, no ratings.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about" },
};

// Keep this page true to the site. Before any merge to master, read it
// against what the site actually does (CLAUDE.md, Workflow).
export default function AboutPage() {
  return (
    <section className="page active" id="page-about">
      <div className="about">
        <div className="label">About</div>
        <h1>About The Dispatch.</h1>
        <div className="about-body">
          <p>
            The Dispatch is a free research file on every U.S. public company, built from what
            each company reports to the SEC. There is no account, no paywall, and no rating
            telling you what to buy. It started from a small, unfashionable conviction: most
            investors would make better decisions if they did less, read more, and stared at
            fewer charts. This is not a terminal. It is a research desk.
          </p>

          <h2>What&rsquo;s in a file.</h2>

          <p>
            Type in a ticker and you get six tabs. Overview describes the business in the
            company&rsquo;s own words from its annual report, with the facts that stand out and a
            price chart from one day to the company&rsquo;s full history. Financials shows ten
            years of revenue, profit and cash flow, annual and quarterly. Valuation shows what
            today&rsquo;s share price assumes: the growth in free cash flow the price implies, and
            how the company&rsquo;s multiples compare with its own history. Earnings shows how each
            quarter compared with expectations and what the company itself guided to. Insiders
            lists what executives and directors have bought and sold on the open market. Filings
            shows what changed in the company&rsquo;s risk factors from one annual report to the
            next.
          </p>

          <h2>The screener.</h2>

          <p>
            The screener filters about 4,600 U.S.-listed companies by the figures in their
            filings: growth, margins, free cash flow, return on capital, debt, dividends and
            buybacks. It opens on a set of starting screens grouped by the question each one
            answers, such as whether a business is strong, whether its growth pays off, and where
            its cash goes. Every result opens that company&rsquo;s file. It screens on the
            business, not the share price, so it has no P/E or market value filters. Each
            company&rsquo;s Valuation tab covers what the price assumes.
          </p>

          <h2>Where the numbers come from.</h2>

          <p>
            Every figure traces back to a filing on SEC EDGAR, refreshed as new reports arrive.
            Prices come from Twelve Data and Finnhub. Free cash flow is operating cash flow minus
            capital spending, and it is labelled as calculated by The Dispatch, because it
            isn&rsquo;t a reported line. Where a measure doesn&rsquo;t fit a business, such as
            gross margin at a bank, the file shows n/a rather than a number that looks right and
            isn&rsquo;t. Companies file errors too; where one is caught, the file shows the
            corrected figure if the annual report settles it, and a blank if it doesn&rsquo;t.
          </p>

          <h2>What we are not.</h2>

          <p>
            The Dispatch does not offer investment advice. Nothing here rates a stock, scores it,
            ranks it, or sets a target price. The valuation tool tells you what growth
            today&rsquo;s price requires. Whether that growth is likely is the judgment, and the
            judgment should be yours.
          </p>

          <h2 id="contact">Who&rsquo;s behind this.</h2>

          <p>
            Everything above reads as &ldquo;we,&rdquo; because that&rsquo;s how research usually
            reads, but The Dispatch is built and run by one person. I&rsquo;m Eli Poteet, a
            finance student at the University of New Hampshire. I built this because I got tired
            of juggling six tabs and a spreadsheet to get a straight answer on a company I already
            cared about, and because the sites that did have the answer either sold me a verdict
            or hid the numbers behind a subscription. I wanted one page that did the reading and
            showed its work.
          </p>

          <p>
            There&rsquo;s no team, no compliance desk, no firm. If you spot something wrong, a
            company whose figures look off, or just want to talk shop, reach out. I read
            everything.
          </p>

          <p className="about-signature">
            <span className="name">— Eli Poteet</span>
            <br />
            <a href="mailto:eli.poteet@gmail.com">eli.poteet@gmail.com</a>
            {" · "}
            <a href="https://www.linkedin.com/in/eli-poteet" target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            {" · "}
            <a href="https://github.com/elipoteet" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
