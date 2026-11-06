# Phase Eleven: The Screener

Written 5 November 2026. Build brief for Claude Code.

## For this session

Read this whole brief, then `AGENTS.md`, `ARCHITECTURE.md`, `docs/phase-nine.md` and `docs/phase-ten.md`. Cut a new branch `feat/screener` from `master` and save this brief as `docs/phase-eleven.md` on it. Plan Stage A only, then build it once Eli approves the plan. Stage A ends at a checkpoint where you stop and report. Do not start Stage B until Eli has read the report and said go.

Eli is a finance student, not an engineer. Explain everything to him in plain, everyday language: what it means for him and the site first, no jargon, no code walkthroughs unless he asks. The engineering stays rigorous; only the explanations are simple.

## For Eli, in plain English

The site gets a free stock screener at dispatchresearch.com/screener. A visitor filters about 5,600 U.S. public companies by what each one reports to the SEC: growth, margins, cash flow, debt, dividends and more, and every result opens that company's research file. It needs no account, and a screen can be shared as a link. It filters on the business, not the share price, so there are no P/E or market value filters yet.

It is built in four stages. The first is about getting the numbers right and measuring how big the nightly download is, and it ends with a short report to you before anything is built on top. Nothing reaches the live site until you sign off.

## Decisions already made, do not relitigate

1. Business only. Every filter comes from SEC filings. No P/E, dividend yield, market value or price-move filters, and no Twelve Data or Finnhub calls from anything in this phase. The page says so in one line and points to each company's own file for price-based measures.
2. The page opens on starting screens, each a named set of filters worded as a plain description ("Revenue up 20% or more, cash flow positive"), never as a pick. "Revenue falling" sits among them on purpose.
3. Every filter in the list below goes in: ten main filters shown up front, seventeen more behind a "More filters" button.
4. Nothing ranks, scores or highlights a company as better. No "top", "best", "picks" or winner language. Results sort by whichever column the visitor chooses; the default is revenue, largest first, because it is neutral.
5. A measure that doesn't fit a business shows "n/a" (gross margin at a bank). Those companies drop out of any filter on that measure. A missing number is never treated as zero.

## The mockup

Eli approved a Design mockup, "Dispatch Screener", on claude.ai. You can't open it, so here it is in words. Match the brand: navy, cream and gold, Inter and IBM Plex Mono, square corners, calm editorial voice, the same tokens and classes as the research file (`app/research-file.css`).

- Opening view at `/screener`: kicker "Screener", headline "Find companies by what they report", one-paragraph dek saying it filters about 5,600 companies from their SEC filings and finds companies to read about, not which to own. A grid of numbered starting-screen cards (number, title, the filters in mono, company count, arrow). Below it, "Or build your own" with a button that opens the full list. Then three short points: from the filings, facts not rankings, no price filters yet.
- A screen applied: back link to the starting screens, the screen's title, "143 companies match. Sorted by revenue, largest first." A toolbar of the active filters as removable chips, an "Edit filters" toggle and "Copy link to this screen". The filter panel groups the main filters with min and max boxes, then a "More filters" toggle opening the rest, then one line naming the price filters we can't offer. The results table: company name with ticker, sector, revenue, then columns that follow the active filters. Header cells sort. Fifty rows at a time with "Show 50 more". A note box explains the fiscal-year basis, that free cash flow is calculated by The Dispatch, and what n/a means.
- Phone, 390px: filters and sort become two buttons at the top, each result is a two-line row (name, ticker and revenue, then the two numbers that match the active filters).
- No matches: say which filter is tightest, with how many companies meet it alone, and offer to remove it or clear all.
- Screener goes in the main nav between Research and About. The home page's "Coming" Screener card becomes a live link, and `/research` gets a way in.

## The filters

All from each company's latest full fiscal year unless stated. Growth over N years is the compound average yearly rate. Shown "n/a" where stated; never guess.

Main ten:
- Revenue, latest year
- Revenue growth, 1 yr (n/a if prior year revenue is zero or below)
- Revenue growth, 3 yr average
- Gross margin (n/a for financial filers and REITs)
- Operating margin
- Net margin
- Free cash flow margin: operating cash flow minus capex, over revenue (n/a for financial filers and REITs)
- Net cash or debt: cash and equivalents minus total debt (n/a for financial filers)
- Share count change, 1 yr
- Sector, from the SIC code grouped into about eleven plain sectors

More filters:
- Profitability: return on equity (n/a if equity is zero or below), return on assets, net income growth 1 yr (n/a if prior year is a loss), EPS growth 1 yr (same rule)
- Spending, each as a share of revenue: R&D, capital spending, sales and admin costs
- Shareholder returns: pays a dividend (yes, no, either), dividends as a share of free cash flow, buybacks as a share of free cash flow (both n/a if free cash flow is zero or below)
- Balance sheet health: debt to equity (n/a if equity is zero or below, and for financial filers), current ratio (current assets over current liabilities), interest coverage (operating income over interest expense; n/a with no interest expense, and for financial filers)
- Longer history: revenue growth 5 yr average, 10 yr average, years in a row of revenue growth
- Location: headquarters state, as a multi-select (a starting screen uses all six New England states)

Starting screens: Revenue up 20% or more and cash flow positive; Share count shrinking (down 2% or more); More cash than debt with revenue over $1B; Gross margin above 70% with revenue over $100M; Losing money and growing revenue 30% or more; Revenue falling (down 10% or more); Pays a dividend with more cash than debt; Revenue up ten years in a row; Based in New England. Keep their definitions in one file, and show live counts.

## Data rules

Read `lib/sec/client.ts` and `lib/sec/concepts.ts` first. All SEC requests go through the existing client, with its User-Agent from `SEC_CONTACT_EMAIL` and its rate limit.

- Source: the SEC frames API, `https://data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json`. One file per tag per period covers every company. Annual durations use `CY2025`-style periods; balance-sheet items use instants such as `CY2025Q4I`. Confirmed reachable on 5 November: the CY2025 `NetIncomeLoss` frame has about 5,600 entries.
- Frames are per tag, so each line item needs one file per tag in its `CONCEPT_TAGS` fallback list. For each company take the first tag in that order that has a value, exactly as the normaliser does. Reuse the lists; don't fork them.
- New line items are needed: R&D, sales and admin, interest expense, dividends paid, current assets, current liabilities. Add ordered tag lists to `concepts.ts`, with comments on where each was checked, as the existing ones have. Adding them must not change any number on any existing company page: the full test suite and the twenty-company check pass unchanged. If it requires bumping `NORMALIZER_VERSION`, say why in the recap.
- Frames place each company's fiscal year in the nearest calendar year (AAR's year ending May 2026 appears in CY2025). Store and show each company's actual fiscal year end. Exclude any company whose latest annual period ended more than 18 months ago.
- Frames carry CIK, not ticker. Map through the SEC ticker file the site already caches. Leave out companies with no listed ticker, and pick one ticker where a company has several (GOOGL over GOOG; document the rule).
- Sector and the bank, insurer and REIT rules need every company's SIC code, but `sec_company` only holds companies someone has opened. Getting SIC for all of them means one submissions file per company, about 5,600 requests, once. Measure this in Stage A.
- Headquarters state: the frames `loc` field ("US-IL"). Check how complete it is. Non-U.S. locations show as "Outside the U.S.", and missing ones are blank, not guessed.
- Stock splits: share count change and EPS growth compare two years. Verify with NVDA (10-for-1, June 2024) and AVGO (10-for-1, July 2024) that the figures frames return are on a consistent share basis. If a split shows up as a jump, treat that year's change as n/a and say so in the recap. Don't paper over it.
- Foreign filers report in IFRS and won't appear in us-gaap frames. The page says "U.S. filers" where it states coverage.

### Storage

New migration `supabase/migrations/0026_screener.sql`. New objects only. Eli pastes migrations into Supabase by hand; never run DDL against the live database. If anything would alter an existing table, stop and ask.

- `screener_metrics`: one wide row per company (cik, ticker, name, sector, state, fiscal year end, period end, then one column per filter value, plus `updated_at`). Rebuilt by the job, read by the page. Public read, service-role write, no policy that queries its own table.
- Whatever the job needs to track progress across runs (for example, which frames it has fetched and when), as its own small table.
- Raw frames files are several megabytes and must never go in the Vercel data cache. Process them in a stream or in memory and keep only the computed values.

## The nightly job: measure first

The only cron, `/api/cron/alerts` at 21:30 UTC, already spends its full 60 seconds on alerts and company refreshes. The screener cannot fold into it, which is a departure from the usual reuse-before-building rule.

Stage A measures, with real requests: how many frames files a full refresh needs (count every tag across the line items and every year for the 10-year history), their sizes, the download and processing time, the one-off SIC backfill, and what a nightly refresh actually has to re-fetch (likely only the latest one or two years). Also confirm the Vercel plan's real limits: cron count and frequency, and function duration with and without fluid compute. Check, don't assume.

Then recommend one of these to Eli, with the numbers:

1. A second Vercel cron that refreshes a slice each night and keeps its place, so a full cycle takes several nights.
2. A scheduled GitHub Action (free for a public repo, with a much longer time limit) that runs the whole refresh nightly and writes to Supabase with a service key stored as a GitHub secret.
3. Something better you find.

The mockup says "Updated nightly". If the answer means data refreshes over several days, the copy changes to show the real last-updated date instead, and you say so.

## The stages

Each stage ends deployable on the branch preview and passes its own Done-means before the next starts.

### Stage A. The numbers, and the measurement report

No UI. Frames fetching in `lib/sec/`, the new tag lists, and metric calculation as pure functions with unit tests for every filter's formula and every n/a rule. Fixtures saved from real frames responses. Migration 0026 written but not applied.

Done means:
- Unit tests cover each metric, including n/a cases: a bank (JPM), a REIT, negative equity (MCD), a loss-maker, a non-December fiscal year (NVDA ends in January), and the split cases above.
- NVDA fiscal 2026 matches the 10-K: revenue $215.9B, net income $120.1B, operating cash flow $102.7B, capex $6.0B, free cash flow $96.7B. Show the margins those produce.
- A script prints every main-ten metric for twenty large companies. Spot-check five against their actual 10-Ks and report every mismatch found and fixed.
- The measurement report above, in plain language, with a recommendation. Then stop.

### Stage B. The job and the backfill

Build the job Eli chose. The SIC backfill and ten-year history load once, then the nightly refresh keeps them current. Log each run: companies updated, files fetched, time taken, anything skipped and why.

Done means: `screener_metrics` holds a row for every listed U.S. filer with a recent annual report. Report the count and how many have n/a for each metric. Spot-check ten companies across sizes and industries against their 10-Ks. A second run changes nothing it shouldn't.

### Stage C. The page, main filters

`/screener` as in the mockup: starting screens, the filter panel with the main ten, the results table, sorting, paging fifty at a time, and the no-matches state. The whole screen lives in the page link, so copy-link, the back button and a texted link all reproduce it. Filtering and sorting happen in the database query, not by sending every row to the browser. Nav, home page card and `/research` link updated, and the page added to the sitemap.

- Metadata: `/screener` and each starting screen are indexable, with their own titles and descriptions. Arbitrary filter combinations in the link are `noindex` with a canonical of `/screener`. Verify the robots output with curl; documented `noindex` behavior has been wrong in this setup before.
- Recoverable failures (job hasn't run, database slow) render in the page as a normal 200 with an inline message. Don't throw; `error.tsx` is unreliable here.
- Inputs validate quietly: a percent box accepts "20" or "20%", nonsense in the link is ignored rather than erroring.

### Stage D. More filters

The seventeen extra filters behind "More filters", the multi-select state filter, and the three starting screens that use them. Columns in the results table follow the active filters, so a dividend screen shows dividend columns.

## Before calling any stage done

1. `npx tsc --noEmit`, `npm test` and `npm run build` are clean. Lint has about eight known pre-existing failures; add none.
2. A real `next start`, hit with curl. Routing, caching and metadata are verified empirically, never from docs.
3. Incognito check of every new page, signed out.
4. Checked at 390px. The wide table scrolls inside its own box; nothing scrolls the page sideways.
5. Light and dark mode both checked.
6. The network log for a full click-through of the screener shows zero Twelve Data and zero Finnhub calls.
7. The rendered HTML contains none of "fair value", "target", "undervalued", "overvalued", "top pick", "best", "winner", or "buy", "sell" or "hold" as standalone words ("buybacks" is fine).
8. A short recap in `docs/` in plain language: what a visitor now sees, what deviated from this brief, and what the brief got wrong.

Commit to `feat/screener` and push. Do not merge or open a pull request without Eli's explicit sign-off.
