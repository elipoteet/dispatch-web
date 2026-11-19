import Link from "next/link";
import { dayLabel } from "@/lib/screener/filters";
import { loadOverview } from "@/lib/screener/query";
import { FAVORITE_SCREEN, GROUPED_SCREENS, SCREEN_GROUPS, type ScreenGroup, type StartingScreen } from "@/lib/screener/screens";
import { BUILD_YOUR_OWN_HREF } from "@/components/screener/ScreenerResults";
import { ScreenerLink } from "@/components/screener/ScreenerLink";

// The screener's opening view: what it is, the starting screens grouped under
// the question each answers (the addendum, 7 November 2026), one slim row
// each with its title, a one-line description and a live count, in two
// columns at desktop width so the whole set fits on about one screen (Eli's
// mockup, 16 November 2026); then a way to build your own, and three things
// to know. Eli's own screen sits first, full width, with a gold border. Each
// screen's filters and its longer why-line are on its own page.
function ScreenRow({ s, count }: { s: StartingScreen; count: number | undefined }) {
  return (
    <li>
      <Link href={`/screener/${s.slug}`} className="rf-scr-row-link" prefetch={false}>
        <span className="rf-scr-row-text">
          <span className="rf-scr-row-title">{s.title}</span>
          <span className="rf-scr-row-desc">{s.description}</span>
        </span>
        <span className="rf-scr-row-count">{count != null ? `${count.toLocaleString("en-US")} ${count === 1 ? "company" : "companies"}` : ""}</span>
        <span aria-hidden="true" className="rf-scr-row-arrow">
          →
        </span>
      </Link>
    </li>
  );
}

// Left: quality and growth. Right: the other four.
const COLUMNS: readonly (readonly ScreenGroup[])[] = [
  ["quality", "growth"],
  ["returns", "balance", "scrutiny", "home"],
];

export async function ScreenerHome() {
  const overview = await loadOverview();
  const counts = overview.ok ? overview.data.counts : null;
  const about = overview.ok ? `about ${(Math.round(overview.data.total / 100) * 100).toLocaleString("en-US")}` : "about 4,600";
  const updated = overview.ok ? dayLabel(overview.data.updated) : null;
  const favCount = counts?.[FAVORITE_SCREEN.slug];

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

        <section className="rf-scr-section rf-scr-start" aria-labelledby="scr-start">
          <div>
            <h2 className="rf-h2" id="scr-start">
              Start with a question
            </h2>
            <p className="rf-dek">Each screen is a set of filters you can open, sort and change.</p>
          </div>

          <Link href={`/screener/${FAVORITE_SCREEN.slug}`} className="rf-scr-row-link rf-scr-fav" prefetch={false} aria-label={`${FAVORITE_SCREEN.kicker}: ${FAVORITE_SCREEN.title}`}>
            <span className="rf-lbl rf-scr-fav-kicker">{FAVORITE_SCREEN.kicker}</span>
            <span className="rf-scr-row-text">
              <span className="rf-scr-row-title">{FAVORITE_SCREEN.title}</span>
              <span className="rf-scr-row-desc">{FAVORITE_SCREEN.description}</span>
            </span>
            <span className="rf-scr-row-count">{favCount != null ? `${favCount.toLocaleString("en-US")} ${favCount === 1 ? "company" : "companies"}` : ""}</span>
            <span aria-hidden="true" className="rf-scr-row-arrow">
              →
            </span>
          </Link>

          <div className="rf-scr-columns">
            {COLUMNS.map((keys, i) => (
              <div key={i} className="rf-scr-column">
                {keys.map((key) => {
                  const g = SCREEN_GROUPS.find((x) => x.key === key)!;
                  const screens = GROUPED_SCREENS.filter((s) => s.group === key);
                  if (!screens.length) return null;
                  return (
                    <section key={key} className="rf-scr-question" aria-labelledby={`scr-q-${key}`}>
                      <h3 className="rf-scr-q" id={`scr-q-${key}`}>
                        <span className="rf-lbl">{g.label}</span>
                        <span className="rf-scr-q-text">{g.question}</span>
                      </h3>
                      <ul className="rf-scr-rows-list">
                        {screens.map((s) => (
                          <ScreenRow key={s.slug} s={s} count={counts?.[s.slug]} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
          {counts && <p className="rf-scr-updated">Numbers are companies matching each screen tonight. Open any screen to see its exact filters.</p>}
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
          <ScreenerLink href={BUILD_YOUR_OWN_HREF} className="rf-btn">
            Open the filters
          </ScreenerLink>
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
