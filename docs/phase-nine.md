# Phase Nine: Research, Done Properly

Written 6 October 2026. Build brief for Claude Code. Branch `feat/research-v2`, cut from `feat/social-v1`.

## For Eli, in plain English

The research page goes from one short page of six numbers to a proper research file on every U.S. company, organised into tabs: Overview, Financials, Valuation, Earnings, Insiders, Filings, and Discussion. It gets price charts from one day out to the company's full history, a "what's priced in" calculator, ten years of financials, insider trades, and an AI summary of what changed in each new annual report. A free screener comes at the end.

All of it runs on free data. The backbone is the SEC, which publishes every public company's reported numbers at no cost. Nothing gives a rating, a target price, or a "fair value."

It's built in eight stages. Each one ends with something you can click on the preview site before the next one starts. Nothing reaches the live site until you sign off. Five decisions near the bottom are yours; none of them block Stage 1.

## Read first

`claude/product-spec.md` (v2), `claude/state-of-play.md`, `claude-project-context.md`, `claude/research-revamp.md` (the three decisions this phase rests on), and `docs/phase-five.md` (the current ticker page). The visual reference is the Design artifact "Research Page Revamp," NVDA ticker page mockup v3.

## Decisions already made, do not relitigate

1. Research becomes a deep pillar inside the social site, not a separate product. It amends the spec's "Research: a utility, not a pillar." Update that section of the spec when this phase merges, not before.
2. No rating, score, verdict, target price, fair value, or buy/sell language anywhere. The valuation tool outputs the growth the price implies, never a value the stock "should" be. That line is the difference between context and a verdict, and it must hold.
3. Free data only: SEC EDGAR, plus the existing Twelve Data and Finnhub free tiers. No paid provider.
4. The price chart offers 1D, 1W, 1M, 3M, 1Y, 5Y, 10Y and MAX.
5. Numbers stay above the conversation on the ticker page (Eli's call in phase five), with a "From the network" strip on Overview and the full thread under Discussion.

## Where the code is today

`app/(social)/research/[ticker]/page.tsx` renders header, posts, a one-year chart and six stats. `lib/analysis/tickerSnapshot.ts` is all Finnhub. `lib/analysis/tickerChart.ts` wraps Twelve Data daily history (outputsize 1300, about five years) in `unstable_cache` at 24 hours. `lib/cache.ts` is an in-memory `Map` and must not be used for anything new, since it does not survive between serverless invocations. `vercel.json` already runs four daily crons. Tests run on vitest.

## Data rules for the whole phase

### SEC EDGAR

- Every request carries a `User-Agent` naming the site and a contact email (Eli supplies the address, decision 1 below). Requests without one get blocked. Stay under 10 requests a second.
- Ticker to company: `https://www.sec.gov/files/company_tickers.json` maps every listed symbol to its CIK (the SEC's company ID) and name. Cache it for 24 hours. It also powers company-name search.
- Financials: `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. This file runs to several megabytes for large companies, and Vercel's data cache rejects items over about 2MB. So normalise it into the compact shape below before caching or storing, and never cache the raw file. Verify the size limit empirically rather than trusting this sentence.
- Filings list: `https://data.sec.gov/submissions/CIK##########.json`. It's small and cheap, and it's how you detect that a new 10-K, 10-Q or Form 4 exists.
- Bulk, one metric across all companies: `https://data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json`. This is what the screener uses.

### Turning SEC facts into clean numbers

This is the hard part of the phase and where wrong numbers come from. Get it right before any UI.

- Each line item is reported under different tags by different companies. Revenue alone may be `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` or others, and a company may switch tags between years. Keep an ordered fallback list per line item in one file, and take the first tag that has data for that period.
- The same figure appears many times, because each filing restates prior years as comparatives. For each fiscal period, take the value from the earliest filing that reported it (the `frame` field identifies the canonical value for a period). Restatements are the exception: if a later 10-K changes a prior year, show the latest and mark the cell.
- 10-Ks report full years, not fourth quarters. Q4 for duration items (revenue, income, cash flow) is the full year minus Q1 to Q3. Balance-sheet items are point-in-time and are never summed.
- Cash flow items in 10-Qs are year-to-date. Q2 and Q3 standalone values must be derived by subtraction.
- Free cash flow is operating cash flow minus capital expenditure (`PaymentsToAcquirePropertyPlantAndEquipment`). Label it as calculated by The Dispatch, because it isn't a reported line.
- Banks, insurers and REITs report on structures where "gross margin" and "free cash flow" are meaningless. Detect them by SIC code from the submissions file, show the lines that make sense, and say plainly what's not shown and why. A blank is fine; a wrong number is not.
- Foreign filers (20-F, IFRS taxonomy) are out of scope for v1. Their Financials tab says the filing history isn't available yet.
- ETFs, indexes, crypto and currencies have no SEC data. Their pages show price chart and Discussion only, and the SEC tabs don't render. The spec covers all of finance, so these pages must work, just with less on them.

### Storage

New tables in `supabase/migrations/0021_research_data.sql`. New objects only. Eli pastes it by hand. Never run DDL against the live database.

- `sec_company`: cik, symbol, name, sic, fiscal_year_end, filer_type, last_checked_at.
- `sec_financials`: cik, period_end, fiscal_year, fiscal_period (FY, Q1 to Q4), line_item, value, unit, source_tag, accession, filed_at, restated flag. Unique on (cik, fiscal_year, fiscal_period, line_item).
- `insider_trades` (Stage 6), `filing_changes` (Stage 7), `screener_metrics` (Stage 8). Define each in its stage, all in the same migration file, so Eli pastes once.
- All are public-read, service-role write. Keep RLS simple, with no policy that queries its own table (gotcha 5).

A company's financials load from SEC the first time anyone opens its page, then come from the table. Refresh happens when the submissions file shows a filing newer than the latest one stored. Fold that check into an existing daily cron rather than adding a fifth, and only for companies someone has opened or posted about.

### Twelve Data budget (8 requests a minute, the binding constraint)

| Chart | Source | Cache | Cost |
|---|---|---|---|
| 1D | 5-minute bars | 5 min in market hours, until next open after close | 1 per ticker per 5 min, only while viewed |
| 1W | 1-hour bars | 30 min | 1 per ticker per 30 min |
| 1M, 3M, 1Y, 5Y | existing daily call | 24 h (already built) | 0 extra |
| 10Y, MAX | daily, outputsize 5000, downsampled to weekly or monthly | 24 h | 1 per ticker per day |

Every Twelve Data call goes through one wrapper that counts calls in the current minute. When the count is used up, or the API answers with a rate-limit error, the chart shows a quiet "Updating, try again in a minute" in its own frame, and nothing else on the page is affected. Do not throw; `error.tsx` is unreliable here (gotcha 1). Confirm what delay the free plan's intraday data actually has, and label the 1D chart with it. If it's 15 minutes, say "Delayed 15 min."

Finnhub free endpoints in use: profile, metrics, quote, `/stock/peers`, `/stock/earnings`, `/calendar/earnings`. Confirm each still returns data on the free plan before building on it. Some Finnhub endpoints have moved behind paywalls before.

## The stages

Each stage ends deployable on the branch preview, with its own Done-means list passing, before the next starts.

### Stage 1. The SEC data layer

No UI. Build `lib/sec/`: ticker-to-CIK lookup, a fetch wrapper with User-Agent and rate limiting, the normaliser described above, and read/write against `sec_financials`.

Done means:
- Unit tests with fixtures saved from real SEC responses for NVDA, AAPL, JPM, one small cap, and one company that changed revenue tags.
- NVDA fiscal 2026 matches the 10-K: revenue $215.9B, net income $120.1B, operating cash flow $102.7B, capex $6.0B, free cash flow $96.7B, segment split Data Center $193.7B, Gaming $16.0B, Pro Visualization $3.2B, Automotive $2.3B. Segment data may sit in a different part of the XBRL from the totals. If it's not reliably extractable, report that rather than forcing it.
- Derived Q4 for NVDA FY2026 equals $68.1B revenue.
- JPM shows no gross margin and no free cash flow, with the explanation present.
- A script prints ten years of the five core lines for twenty large companies. Spot-check five against their actual 10-Ks and report every mismatch found and fixed.

### Stage 2. The new ticker page: shell, Overview, Financials, Discussion

Each tab is its own URL: `/research/nvda`, `/research/nvda/financials`, `/research/nvda/valuation`, and so on. That way a tab can be texted to someone, and each tab loads only the data it needs. Verify with `next start` and curl that nested segments under `[ticker]` route, 404 and redirect-to-lowercase exactly like the base page. Do not assume.

- Header as in the mockup: name, ticker, exchange, sector, fiscal year end, price, day change, 52-week range bar, and the buttons Post about $SYM, Compare and Time Machine (the last two only if decision 4 says yes).
- Overview: two-sentence plain description, revenue mix bar, the three "What stands out" facts, the key-stats grid, the price chart, and the latest post strip.
- "What stands out" is generated by rules, not AI, from the stored financials. Examples: the multi-year growth multiple, a margin moving more than two points, buybacks as a share of free cash flow, a new 52-week high or low. Facts only. Every rule is unit-tested and phrased so it can't read as advice.
- The two-sentence description comes from the 10-K's Item 1 business section, summarised once by Claude per company and stored. It's the one AI-written line on Overview, and it's labelled as such.
- Financials: metric chips, annual and quarterly toggle, bar chart, and the ten-year table with growth and margin rows. Source line and restatement markers included.
- Discussion: the existing `getPostsByTicker` and `PostCard`, unchanged in behaviour.
- The existing six-stat page must not regress for any ticker during the transition.

### The home page (added 30 October; Eli asked Claude to choose)

Once the memo is gone, `/` becomes the front door to the research files. Built in Stage 2, so the preview has a way in from the day the first company page exists. Top to bottom:

1. **Search first.** One line saying what the site is: a free research file on every U.S. public company, read from its SEC filings. Under it, one search box that takes a ticker or a company name, matched against the SEC ticker file (`company_tickers.json`, already cached 24 hours by `lib/sec`). Picking a result goes to `/research/{ticker}`. The same search component serves `/research` in Stage 8.
2. **What's in a file.** The six tabs (Overview, Financials, Valuation, Earnings, Insiders, Filings), one plain sentence each, each linking to that tab on one example company. A tab that isn't built yet is listed without a link and marked "coming".
3. **Start with a company.** Six example companies across sectors, one of them a bank so the honest-gaps handling shows (for example NVDA, AAPL, COST, CVX, KO, JPM). Each card shows name, ticker, sector and one "What stands out" fact from the stored financials. **No live prices on the home page:** six quote calls per visit would spend the Twelve Data budget on a page nobody came to for prices.
4. **Tools.** Screener and Compare (each shown once built), and the portfolio simulator, which stays (Eli, 30 October).
5. **How it works, in three short lines.** The numbers come from SEC filings and link back to them. Nothing here rates a stock or sets a price target. It's free.

Removed from today's home page: the ticker tape, the "Dispatch Method" features block, and the Time Machine teaser (phase nine leaves the Time Machine out). New title and description, with nothing about memos or scoring. Square corners, matching the research pages.

Old URLs: `/research/{ticker}` is the same address for the old memo and the new file, so old links land on the new page by construction. A Time Machine link (`?asOf=`) redirects to the plain ticker URL. Verify both with `next start` and curl.

### Stage 3. Price chart ranges

The eight ranges, sources and caches as per the budget table. Mark earnings dates on 3M and longer ranges from Finnhub's calendar. 1D shows a dotted line at the previous close. The chart redraws in place when a range is clicked, with no full page reload.

Done means: in a fresh incognito window, click every range on NVDA and confirm the network log shows no more Twelve Data calls than the table allows. Force the limiter to "used up" and confirm the fallback renders.

### Stage 4. Valuation

- What's priced in. Base free cash flow is the trailing four quarters from SEC. Market value is price times shares outstanding (`dei:EntityCommonStockSharesOutstanding`, cross-checked against Finnhub's market cap). Discount the next N years of free cash flow growing at g, plus a terminal value growing at the terminal rate. Solve for g by bisection so the total equals market value. Inputs: required return from 7% to 13% (default 10%), terminal growth from 1% to 4% (default 3%), and 5, 10 or 15 years (default 10). Output a sentence: "To justify today's price, free cash flow has to grow about X% a year for N years," plus the implied year-N free cash flow. If trailing free cash flow is zero or negative, the calculator doesn't render; it explains why in one line. Never output a per-share value, an upside or a downside.
- Yields: free cash flow yield, earnings yield, buyback yield, and the 10-year Treasury yield for scale. The Treasury rate comes from Treasury's free daily yield-curve data and is cached 24 hours.
- Against its own history: P/E, EV/sales and free cash flow yield at each quarter end over ten years, built from stored quarterly financials and the daily price history. Show today's position against the ten-year range and median.
- Peers: Finnhub `/stock/peers`, then each peer's figures from `sec_financials`. A peer whose financials aren't stored yet is loaded in the background and shows "loading" rather than costing the page a request storm. Cap at six peers.

Done means: the solver is unit-tested against a hand-built spreadsheet case. At NVDA's mockup inputs (market value $5.77T, free cash flow $96.7B, 10%, 3%, 10 years) it lands near 22%. Search the rendered HTML for "fair value", "target", "undervalued", "overvalued", "buy", "sell" and "hold". There must be no matches outside post bodies.

### Stage 5. Earnings

Next report date from Finnhub's calendar. Quarterly revenue and EPS bars from SEC. Reported versus estimated EPS for the last four quarters from Finnhub, with plain wording ("came in $0.05 above the average estimate"). The company's own guidance is taken from the earnings press release (8-K exhibit 99.1), extracted by Claude, stored per filing, and shown as a hatched bar labelled as guidance. If extraction isn't confident, it shows nothing rather than a guess.

### Stage 6. Insiders

Parse Form 4 XML found through the submissions file. Store purchases (code P) and sales (code S) by default. Grants, option exercises and tax withholding sit behind a "show all" toggle, since they're mostly noise. Flag trades made under a preset 10b5-1 plan; Form 4 has carried that checkbox since 2023. Summary row: total bought and sold over the last 12 months, and the share of sales made on preset plans. Link each row to its filing. Refresh through the daily cron for companies people have opened.

### Stage 7. Filings and "what changed"

- A filings list linking to EDGAR.
- For each new 10-K, extract Item 1A Risk Factors from the HTML and split it into paragraphs. Match each paragraph to the prior year's using text similarity, and sort the results into added, removed and materially changed. Claude summarises each change in one sentence, and each summary links to the exact paragraph it came from. Store the results in `filing_changes`, generated once per filing by the cron, and only for companies someone has opened or posted about. That caps the API cost.
- Every summary is labelled as an AI summary with "check the filing" one click away. The spec principle applies: an unchecked claim never looks like a checked one.
- 10-Qs can follow the same pattern later. Start with 10-Ks only.

### Stage 8. Research desk and screener

- `/research`: search by ticker or company name from the SEC ticker file, the existing "what people are posting about" grid, and a way into the screener.
- `/research/screen`: a nightly job pulls about ten frames calls (revenue, net income, operating cash flow, capex, gross profit, total debt, cash, shares outstanding) for the latest periods into `screener_metrics`, folded into an existing cron. Filters: revenue growth, gross margin, net margin, free cash flow margin, net debt, and size by revenue. Results link to ticker pages.
- One honest limit: screening by P/E or market value needs a current price for about 6,000 companies, and the free price tier can't supply that. V1 screens on the business, not the price. The page says so in one line. Do not work around it by fanning out Twelve Data calls.

## What not to build

No rating, score, verdict, target price, fair value, upside or downside, or bull/bear case. No AI opinion on whether to own anything. No watchlists (still deferred). No news feed. No paid data. No real-time claims the data doesn't support. No new cron entries when an existing one can carry the work.

## Before calling any stage done

1. `npx tsc --noEmit`, `npm test` and `npm run build` are clean. Lint has about eight known pre-existing failures; add none.
2. A real `next start`, hit with curl. Routing, caching and metadata are verified empirically, never from docs (gotcha 13).
3. Incognito check of every new page, including signed out.
4. Each new tab gets its own metadata title and description. Confirm none inherits the retired product's "scored" description, the same bug as the profile page.
5. Checked at 390px width. Wide tables scroll inside their own box, and tabs scroll sideways.
6. Light and dark mode both checked.
7. The Twelve Data call count for a full click-through of one ticker is reported in the recap.
8. A short recap is written in plain language: what a student now sees, what deviated from this brief, and what the brief got wrong.

## Decisions for Eli

1. Which email goes in the SEC contact header. A site address like research@dispatchresearch.com reads better than a personal one, but it needs to exist. Needed before Stage 1 goes live; Stage 1 can be built without it.
2. Separate URLs per tab. Recommended yes, so a Financials or Valuation view can be shared directly.
3. Square corners on research pages, as in the mockup and the brand's rule for research surfaces, or the softer rounded style of the rest of the social site. The mockup is square; it reads more like a research desk.
4. Bring back Compare (two companies side by side) and the Time Machine (any past date) on the new data, or leave both out. Phase five deliberately dropped them. Compare is cheap with the new tables; the Time Machine is more work.
5. The order of Stages 4 to 8 after the first three. Recommended as written. Valuation and Filings are the two most distinctive, so if you want the standout features sooner, Stage 7 can move up to fourth.
