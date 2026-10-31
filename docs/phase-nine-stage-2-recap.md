# Phase nine, Stage 2 recap: the company page and the home page

Written 31 October 2026. Branch `feat/research-site`. Not on the live site until Eli signs off.

## What a student now sees

**The home page** is a front door to the research files. A search box takes a ticker or a company name ("costco" finds Costco). Below it: the six sections a file will have (Overview and Financials live, the rest marked "coming"), six example companies across sectors with one fact each from their filings, the tools (the portfolio simulator now, the screener and Compare later), and three lines on how the site works. No live prices on it.

**Every company has a file at `/research/{ticker}`**, with each tab at its own address (`/research/nvda/financials`) so it can be shared:

- **Header:** name, ticker, exchange, sector, when its fiscal year ends, price and the day's change, a 52-week range bar, and a Paper trade button into the simulator.
- **Overview:** "What stands out", three facts picked by rules from the company's filings. For NVIDIA: revenue is 43 times fiscal 2016's and rose 65% to $215.9B; gross margin fell from 75.0% to 71.1%, the first decline since fiscal 2023; $40.1B spent repurchasing shares, about 41% of free cash flow. Then eight key stats, each with a one-line explanation (market value, P/E, revenue, net margin, gross margin, free cash flow, repurchases, average volume), and the price chart (1D, 1W, 1M, 1Y).
- **Financials:** buttons to chart revenue, net income, free cash flow or a margin; an annual/quarterly switch; and a ten-year table (twelve quarters in quarterly view) of income, cash flow and balance sheet lines, with growth and margin rows. Figures a company later restated are marked, and the notes say what was calculated rather than reported.
- **Banks** say plainly that gross margin and free cash flow don't apply, and show total assets instead.
- **Funds** like SPY get the price page only, with a line saying why. Their Financials address is a real 404.
- **An unknown ticker** gets a real 404 with a search box.

The old memo addresses (`/research/nvda`) now land on the new file. Uppercase addresses and old Time Machine links redirect permanently.

## Verified

- `tsc`, `next build` and all 129 tests pass. Lint adds nothing new.
- On `next start`, checked with curl: every route returns the right status (200, 308 or 404). That includes uppercase tab addresses, which keep their tab, and a fund's Financials tab, which 404s. Each tab has its own title, description and canonical address.
- The facts and figures were checked against the 10-Ks: NVIDIA's $40.1B of repurchases and its 75.0% to 71.1% margin slip, and JPMorgan's $4.42T of assets and $362.4B of equity.
- A scan of every page's visible text finds no verdict language. The only matches are the site's own "we don't rate stocks" lines, plus "selling goods" in the note about banks.
- Screenshots at 1440px and 390px, in light and dark.
- **Twelve Data cost of a full click-through** of a company never opened before (Coca-Cola): Overview, Financials, Overview again, then the 1D and 1W ranges. That came to **2 requests**: one for the daily history and one for the intraday chart. Everything else came from cache or from Finnhub.

## What deviated from the brief

- **No revenue-by-segment bar.** The SEC's free summary data drops everything broken out by segment, so NVIDIA's Data Center/Gaming split isn't in it. Getting it means parsing each 10-K's full XBRL tagging. Per the brief, reported rather than forced.
- **No share-count row yet.** The SEC's share counts are as filed, not adjusted for stock splits (NVIDIA: 2,535M, then 25,070M after its split). The "share count" fact only appears when there was no split in the window.
- **The two-sentence description is built but not yet seen working.** The project's Anthropic key has no credit, so every test call failed with "credit balance is too low". It also needs migration 0022 pasted. Until both are done the Overview simply shows no description; it never promises one.
- **Discussion, "From the network" and "Post about"** were dropped, per the 30 October direction note. **Compare and Time Machine buttons** are left out until those features exist.
- **The chart has four ranges, not eight.** Stage 3 adds 3M, 5Y, 10Y and MAX.
- The memo's screens and the routes only they used were deleted. The alert job keeps the parts of the memo engine it needs.

## What the brief got wrong, or didn't know

- **Stage 1 bugs found and fixed:**
  - Reads of stored figures silently stopped at 1,000 rows. NVIDIA was at 887 and about to lose its oldest years.
  - JPMorgan's SEC filing index is 5.3MB, over the cache's 2MB limit, so it was downloaded again on every visit. It's now slimmed to the filing types the site reads before caching.
  - Stored companies never picked up newly added line items. Fixed with a version stamp that triggers one refresh each.
- **"Facts but no annual figures" doesn't mean a foreign filer.** ExxonMobil reorganised in 2026 under a new SEC registration that has no 10-K yet, and Stage 1 called it "IFRS on a 20-F". It now says plainly that there's no full year of figures under its current registration. Joining a company's old and new registrations is future work. Chevron replaced ExxonMobil on the home page.
- **Link prefetching costs data.** The framework pre-loads linked pages in the background, and a pre-loaded company page fetches its data. A home page visit could have cost six Twelve Data requests without a click. Prefetch is now off for those links.
- **Stage 4's word check will trip on the site's own disclaimers.** "The Dispatch does not rate stocks or set price targets" contains "target". That check needs to allow those lines.

## For Eli before this can launch

1. **Paste `supabase/migrations/0022_company_description.sql`** in the Supabase SQL editor. It creates one new table and touches nothing else.
2. **Add credit to the Anthropic account** behind `ANTHROPIC_API_KEY` (console.anthropic.com), and make sure that key is also set in Vercel. Each description costs about five cents, once per company per annual report.
3. **Check Vercel has `SEC_CONTACT_EMAIL`,** for Preview as well as Production, or the preview shows no financials.
4. **The About page still describes the memo and the Time Machine.** It needs your rewrite before launch.
5. **Watchlist and alerts:** the old memo added every ticker you viewed to your watchlist, and alerts fire for watchlisted tickers. The new pages don't add to watchlists. Keep alerts (with a "watch" button), or retire them?
