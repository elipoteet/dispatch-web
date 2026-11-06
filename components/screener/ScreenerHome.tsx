import Link from "next/link";
import { dayLabel, filterLines } from "@/lib/screener/filters";
import { loadOverview } from "@/lib/screener/query";
import { STARTING_SCREENS } from "@/lib/screener/screens";

// The screener's opening view, as the mockup: what it is, the numbered
// starting screens with live counts, a way to build your own, and three
// things to know.
export async function ScreenerHome() {
  const overview = await loadOverview();
  const counts = overview.ok ? overview.data.counts : null;
  const about = overview.ok ? `about ${(Math.round(overview.data.total / 100) * 100).toLocaleString("en-US")}` : "about 4,700";
  const updated = overview.ok ? dayLabel(overview.data.updated) : null;

  return (
    <section className="page active rf" id="page-screener">
      <div className="rf-wrap rf-scr">
        <header className="rf-scr-intro">
          <div className="rf-lbl rf-kicker">Screener</div>
          <h1 className="rf-page-title">Find companies by what they report</h1>
          <p className="rf-page-lede">
            Filter {about} U.S.-listed companies by the figures in their SEC filings: growth, margins, cash flow, debt and share count. It
            finds companies to read about, not which ones to own.
          </p>
        </header>

        {!overview.ok && (
          <p className="rf-note" role="status">
            {overview.reason === "not-built"
              ? "The screener’s figures are being gathered from the SEC for the first time. Check back tomorrow."
              : "The counts couldn’t be loaded just now. Try again in a minute."}
          </p>
        )}

        <section className="rf-scr-section" aria-labelledby="scr-start">
          <div>
            <div className="rf-lbl rf-kicker">Starting screens</div>
            <h2 className="rf-h2" id="scr-start">
              Pick a starting point
            </h2>
            <p className="rf-dek">Each is a set of filters you can open, sort and change.</p>
          </div>
          <ol className="rf-scr-cards">
            {STARTING_SCREENS.map((s, i) => {
              const n = counts?.[s.slug];
              return (
                <li key={s.slug}>
                  <Link href={`/screener/${s.slug}`} className="rf-scr-card" prefetch={false}>
                    <span className="rf-scr-card-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="rf-scr-card-title">{s.title}</span>
                    <span className="rf-scr-card-filters">
                      {filterLines(s.filters, "card").map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </span>
                    <span className="rf-scr-card-foot">
                      <span>{n != null ? `${n.toLocaleString("en-US")} ${n === 1 ? "company" : "companies"}` : " "}</span>
                      <span aria-hidden="true" className="rf-scr-card-arrow">
                        →
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="rf-scr-section rf-scr-build" aria-labelledby="scr-build">
          <div>
            <div className="rf-lbl rf-kicker">Or build your own</div>
            <h2 className="rf-h2" id="scr-build">
              Set your own filters
            </h2>
            <p className="rf-dek">Start from every company and narrow by revenue, growth, margins, free cash flow, net cash, share count and sector.</p>
          </div>
          <Link href="/screener?edit=1" className="rf-btn rf-btn-solid" prefetch={false}>
            Open the filters
          </Link>
        </section>

        <section className="rf-scr-section" aria-labelledby="scr-how">
          <div>
            <div className="rf-lbl rf-kicker">How it works</div>
            <h2 className="rf-h2" id="scr-how">
              Three things to know
            </h2>
          </div>
          <ol className="rf-how-list">
            <li>
              <strong>From the filings.</strong>
              <span>
                Every figure comes from the annual reports companies file with the SEC, updated nightly. Free cash flow is the one we
                calculate: operating cash flow minus capital spending.
              </span>
            </li>
            <li>
              <strong>Facts, not rankings.</strong>
              <span>Results sort by the column you choose, revenue by default. Nothing here scores a company or rates one above another.</span>
            </li>
            <li>
              <strong>No price filters yet.</strong>
              <span>
                P/E, dividend yield, market value and price moves need share prices, so they aren&rsquo;t here. Each company&rsquo;s file has
                them on its Valuation tab.
              </span>
            </li>
          </ol>
          {updated && <p className="rf-scr-updated">Figures last updated {updated}.</p>}
        </section>
      </div>
    </section>
  );
}
