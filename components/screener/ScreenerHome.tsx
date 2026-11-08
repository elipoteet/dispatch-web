import Link from "next/link";
import { dayLabel, filterLines } from "@/lib/screener/filters";
import { loadOverview } from "@/lib/screener/query";
import { SCREEN_GROUPS, STARTING_SCREENS } from "@/lib/screener/screens";
import { BUILD_YOUR_OWN_HREF } from "@/components/screener/ScreenerResults";

// The screener's opening view: what it is, the starting screens grouped under
// the question each answers (the addendum, 7 November 2026), each card with
// its title, why investors look, its filters in plain words and a live
// count; then a way to build your own, and three things to know.
export async function ScreenerHome() {
  const overview = await loadOverview();
  const counts = overview.ok ? overview.data.counts : null;
  const about = overview.ok ? `about ${(Math.round(overview.data.total / 100) * 100).toLocaleString("en-US")}` : "about 4,600";
  const updated = overview.ok ? dayLabel(overview.data.updated) : null;

  return (
    <section className="page active rf" id="page-screener">
      <div className="rf-wrap rf-scr">
        <header className="rf-scr-intro">
          <div className="rf-lbl rf-kicker">Screener</div>
          <h1 className="rf-page-title">Find companies by what they report</h1>
          <p className="rf-page-lede">
            {`Filter ${about} U.S.-listed companies by the figures in their SEC filings: growth, margins, returns, cash flow, debt and dividends. It finds companies to read about, not which ones to own.`}
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
              Start with a question
            </h2>
            <p className="rf-dek">Each screen is a set of filters you can open, sort and change.</p>
          </div>
          {SCREEN_GROUPS.map((g) => {
            const screens = STARTING_SCREENS.filter((s) => s.group === g.key);
            if (!screens.length) return null;
            return (
              <section key={g.key} className="rf-scr-question" aria-labelledby={`scr-q-${g.key}`}>
                <h3 className="rf-scr-q" id={`scr-q-${g.key}`}>
                  <span className="rf-lbl">{g.label}</span>
                  <span className="rf-scr-q-text">{g.question}</span>
                </h3>
                <ol className="rf-scr-cards" start={STARTING_SCREENS.indexOf(screens[0]) + 1}>
                  {screens.map((s) => {
                    // Numbered through all the groups, in the list's order.
                    const n = STARTING_SCREENS.indexOf(s) + 1;
                    const count = counts?.[s.slug];
                    return (
                      <li key={s.slug}>
                        <Link href={`/screener/${s.slug}`} className="rf-scr-card" prefetch={false}>
                          <span className="rf-scr-card-n">{String(n).padStart(2, "0")}</span>
                          <span className="rf-scr-card-title">{s.title}</span>
                          {s.why && <span className="rf-scr-card-why">{s.why}</span>}
                          <span className="rf-scr-card-filters">
                            {filterLines(s.filters, { plain: true }).map((line) => (
                              <span key={line.key}>{line.text}</span>
                            ))}
                          </span>
                          <span className="rf-scr-card-foot">
                            <span>{count != null ? `${count.toLocaleString("en-US")} ${count === 1 ? "company" : "companies"}` : " "}</span>
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
            );
          })}
        </section>

        <section className="rf-scr-section rf-scr-build" aria-labelledby="scr-build">
          <div>
            <div className="rf-lbl rf-kicker">Or build your own</div>
            <h2 className="rf-h2" id="scr-build">
              Set your own filters
            </h2>
            <p className="rf-dek">
              Start from every company with revenue of $100 million or more, then narrow by growth, margins, returns, cash flow, debt,
              dividends, sector and headquarters. Each filter says what it measures and where the middle company sits.
            </p>
          </div>
          <Link href={BUILD_YOUR_OWN_HREF} className="rf-btn rf-btn-solid" prefetch={false}>
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
                Every figure comes from the annual reports companies file with the SEC, updated nightly. Free cash flow, net cash and return on
                invested capital are calculated by The Dispatch, and each filter says how.
              </span>
            </li>
            <li>
              <strong>Facts, not rankings.</strong>
              <span>Results sort by the column you choose. Nothing here scores a company or rates one above another.</span>
            </li>
            <li>
              <strong>No price filters yet.</strong>
              <span>
                {"P/E, dividend yield, market value and price moves need share prices, so they aren’t here. Each result links to what its price assumes, on the company’s Valuation tab."}
              </span>
            </li>
          </ol>
          {updated && <p className="rf-scr-updated">Figures last updated {updated}.</p>}
        </section>
      </div>
    </section>
  );
}
