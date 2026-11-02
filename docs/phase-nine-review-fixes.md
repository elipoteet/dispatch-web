# Phase nine: fixes from the 2 November review

Written 2 November 2026. Branch `feat/research-site`. The review covered stages 2 to 7 at `b6424e8`; this records what was done about each finding and what is left to decide.

## Fixed

1. **An SEC outage no longer makes a company look like a fund.**
   - The SEC lookup now tells "no such filer" apart from "couldn't be reached" (`getSubmissionsResult` and `filesReportsFrom` in `lib/sec/client.ts`).
   - A company with a CIK keeps its tabs during an outage, each saying its figures couldn't be loaded. The Overview says the SEC couldn't be reached, rather than "doesn't file company reports".
   - **Checked by refusing every SEC request on a preview server:** Autodesk's Overview, Financials and Filings all answered 200, stayed indexable, and each showed "couldn't be loaded just now. Try again in a minute." Before the fix the tabs answered 404 with noindex.
2. **The daily cron runs the alert checks first again.**
   - The insider and risk-factor refreshes get what's left of the minute, up to a 50-second deadline that is checked between batches, so they can't overrun.
   - A risk-factor comparison is started only with 12 seconds still in hand.
3. **The insider refresh no longer loses companies past the 1,000-row limit.**
   - It reads a new view, `insider_companies` (migration 0025: one row per company, grouped in the database).
   - Until that's pasted, it reads `insider_filings` a page at a time instead of asking for 5,000 rows and silently getting 1,000.
   - The risk-factor refresh's limit is now stated as the 1,000 it really is; one row per 10-K, so it covers about a thousand companies.
4. **Crawlers don't set off background work** (`lib/research/crawler.ts`, by User-Agent).
   - What they no longer start: loading peers on the Valuation tab, reading back insider filings, and comparing 10-Ks.
   - They still get every page with whatever is stored, and people see no difference.
   - **Checked:** a visit to Oracle's Valuation tab as Googlebot loaded no peers; the same visit as a browser loaded them.
5. **The chart's data routes check the symbol before spending a Twelve Data request** (`isKnownSymbol`: the SEC's ticker list or a Finnhub price, both cached).
   - **Checked:** two made-up symbols got a 404 and cost no request; Coca-Cola's MAX chart cost its one.

Tidy-ups:
- The sitemap lists every tab for the six example companies.
- The default site title is "The Dispatch — Free research on every U.S. public company", not "Equity Research".
- The unused `fetchFinnhubDayChange` (the deleted ticker tape's) is removed, along with its stale comments.
- 0021's header no longer says later tables go in that file.

Tests: 321 pass, including the live twenty-company check. `tsc` is clean, and lint adds nothing new.

## Needs Eli

- **Paste `0025_insider_companies.sql`** (one view, new objects only). The cron works without it, just more slowly as the data grows.
- **Database size (review finding 4).** Crawlers no longer multiply what's stored, but every company a person or crawler opens is still stored for good: often over a thousand rows of financials. On Supabase's free 500MB plan that's very roughly one to two thousand companies before the database fills, and a full database would also stop sign-ins and the portfolio.
  - Watch the size under Supabase → Project Settings → Usage.
  - If it climbs, the next step would be not storing a company's financials on a crawler's visit (fetching them fresh each time instead), or a paid plan.
- **Alerts and the watchlist.** The cron now protects the alert checks, but whether alerts stay at all is still open from the Stage 2 recap.
- **Still open from the recaps:** the 1D chart's intraday delay (needs a weekday session), the About page rewrite, and whether the portfolio simulator and its Paper trade button stay.
