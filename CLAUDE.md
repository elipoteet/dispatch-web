# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

The Dispatch (dispatchresearch.com): a free research file on every U.S.-listed company, built from SEC EDGAR plus the free tiers of Twelve Data, Finnhub and Tiingo. Next.js 16 (App Router, Turbopack), React 19, TypeScript, Supabase (Postgres + Auth), hosted on Vercel. Solo project run by Eli Poteet.

`ARCHITECTURE.md`, `README.md` and the product section of `docs/claude-project-context.md` still describe the retired memo product (ratings, Time Machine, paper trading). For the current product, read `docs/strategy/direction-2026-10-30.md`, then `docs/phase-nine/phase-nine.md` (the research-file plan) and `docs/phase-ten/phase-ten.md`. Each stage has a recap in its phase folder (`docs/phase-*/phase-*-recap.md`). `docs/claude-project-context.md` is still the reference for brand rules and the numbered gotchas.

## Commands

```bash
npm run dev                       # next dev on :3000 (theme colours don't render here, see Gotchas)
npm run build && npm run start    # production build: use this for any visual check
npx tsc --noEmit                  # type-check; run it and the build before calling work done
npm run lint                      # baseline is 4 react-hooks/set-state-in-effect errors + 1 font warning, all pre-existing; add none
npm test                          # vitest run: all co-located *.test.ts
npx vitest run lib/sec/normalize.test.ts            # one file
npx vitest run lib/sec/normalize.test.ts -t "name"  # one test by name
```

- Vitest loads `.env.local` itself (`vitest.config.ts`), so tests that need keys don't silently skip.
- `lib/sec/twentyCompanies.test.ts` hits the live SEC API (~20 s). If the SEC is unreachable it skips rather than fails.
- `TWELVE_DATA_FORCE_BUSY=1` simulates a used-up Twelve Data allowance, for testing the fallbacks.
- `SCREENER_FORCE_FAILURE=unavailable` (or `not-built`) makes the screener page show its inline failure message, for checking it on `next start`.
- On Windows, Git Bash rewrites arguments that start with `/` (e.g. `/research/nvda`) into file paths. Use PowerShell for scripts that take URL paths.

## Architecture

### The research file: `/research/[ticker]`
- `proxy.ts` (Next 16's name for middleware) sends any uppercase `/research/...` path to its lowercase form with a 308, then refreshes the Supabase session.
- `app/research/[ticker]/layout.tsx` resolves the ticker once for every tab: redirect, 404, header, tabs. There is deliberately **no `loading.tsx` at or above this level**. A loading boundary starts streaming before the layout runs, and then `notFound()` and `permanentRedirect()` answer 200 instead of a real 404 or 308.
- `loadCompanyPage` (`lib/research/company.ts`) gathers everything about one company. It is wrapped in React `cache()` so the layout and the tab page share one set of lookups per request. Funds, ETFs and other symbols without SEC reports get only the Overview with a price chart; `filesReports` gates the other five tabs (Financials, Valuation, Earnings, Insiders, Filings).
- Each tab's data shaping lives in `lib/research/*` (pure, unit-tested), and its UI in `components/company/`. The file's styles are in `app/research-file.css`, scoped under `.rf`.

### SEC data layer: `lib/sec/`
- `getCompanyFinancials()` in `lib/sec/index.ts` is the single entry point. It goes from ticker to CIK (the SEC ticker map, `client.ts`), then fetches the small submissions file. If the stored copy is current, it reads from Supabase (`store.ts`). Otherwise it downloads companyfacts once, normalises it (`normalize.ts`, tag lists in `concepts.ts`) and stores the result. If the SEC fails transiently, it falls back to the stored rows.
- "Current" means `sec_company.latest_accession` equals the newest 10-K/10-Q accession **stamped with `NORMALIZER_VERSION`**. Bump `NORMALIZER_VERSION` whenever the normaliser's output changes; that forces exactly one refresh per stored company. `COMPARISON_VERSION` in `filingChanges.ts` does the same for the 10-K risk-factor comparison.
- Every `data.sec.gov` request carries a User-Agent containing `SEC_CONTACT_EMAIL`. There is no fallback on purpose: if it's unset, the SEC layer skips every call and logs why.
- Other pieces:
  - Units errors in a filing (the same figure tagged in two units, e.g. Tigo Energy's revenue): `units.ts`, shared by the normaliser and the screener. A conflict is settled from the filing's own arithmetic or left blank, never guessed.
  - Insider trades: `form4.ts`, `insiders.ts`.
  - "What changed" in the 10-K: `tenK.ts`, `riskFactors.ts`, `filingChanges.ts`.
  - Earnings dates from 8-K Item 2.02, and rule-based guidance: `releases.ts`, `guidance.ts`.
  - Capex gaps filled from Finnhub's as-reported filings: `capexFallback.ts`.
  - Saved real filings used as test fixtures: `lib/sec/__fixtures__/`.

### Market data: `lib/providers.ts`
- Server-only fetch functions, each wrapped in `unstable_cache`.
- Twelve Data serves daily and intraday prices. Its free allowance is 8 requests a minute, shared by everything, and every call goes through `twelveDataSeries`, which counts them. Twelve Data is the only provider with intraday bars for the session in progress.
- Tiingo is the price fallback. It is end-of-day only and not split-adjusted, which `splitAdjust` corrects.
- Finnhub has a separate, larger quota and serves quotes, profiles, estimates, the earnings calendar and the home-page markets tape (`lib/research/markets.ts`). Anything that needs only a live quote must use Finnhub, never Twelve Data.

### Screener: `lib/sec/frames.ts`, `lib/screener/` (phase eleven, in progress)
- Built from the SEC's frames API (one file per tag per calendar period, every company), never from Twelve Data or Finnhub. Brief: `docs/phase-eleven/phase-eleven.md`; Stage A findings: `docs/phase-eleven/phase-eleven-stage-A-report.md`.
- The pieces:
  - `framePlan` says which files to fetch.
  - `assemble.ts` turns them into each company's years, using the normaliser's tag rules.
  - `metrics.ts` computes every filter value, with a reason for every n/a.
  - New tag lists are `SCREENER_CONCEPT_TAGS`, kept out of `CONCEPT_TAGS` so research pages don't move.
  - `job.ts` (run by `/api/cron/screener`, daily) downloads every frames file, writes `screener_metrics`, and logs to `screener_runs`; `rows.ts` holds its pure rules. It works to a 280 s budget: company profiles (`screener_filers`) and 10-K net income fixes it doesn't reach carry over to the next run.
- The page: `/screener` and `/screener/[screen]` (`app/screener/`, `components/screener/`).
  - The whole screen lives in the link. `filters.ts` reads and writes it (pure, shared by the page and the browser's filter panel); nonsense in a link is ignored, never an error.
  - `query.ts` filters, sorts and pages in the database with the public key, and returns a failure reason instead of throwing, so the page answers 200 with an inline message.
  - The starting screens are defined in `screens.ts`; each has its own indexable page. Any other combination in the link is `noindex` with `/screener` as canonical.
  - Links to a company's research file use `prefetch={false}`: prefetching a file loads its data.
- Frames traps:
  - A frame keeps each company's *last-filed* value, so net income often comes from the proxy statement (rounded, restated, sometimes in the wrong units). The job swaps in the 10-K's own figure from the company's concept file (`needsAnnualReportFix`).
  - 10-Qs' trailing-twelve-month spans look like annual periods (`fiscalYearsOnly` drops spans that overlap a real fiscal year).
  - Some filings tag one figure in two units (`lib/sec/units.ts`).
- Live checks are opt-in (`SCREENER_LIVE=1`); see the top of `lib/screener/*.live.test.ts`.

### Background work
- A person's first visit to a tab can start storage work through `after()`: loading peers' SEC files, two years of insider filings, the 10-K comparison. It runs only when `isCrawler()` (`lib/research/crawler.ts`) is false, so crawlers can't fill the database. Headless browsers count as crawlers, so test this with a desktop User-Agent.
- `/api/cron/screener` runs daily at 09:00 UTC (`vercel.json`; see Screener above).
- `/api/cron/alerts` runs daily (`vercel.json`). It first runs the watchlist RSI and moving-average alerts, which still use the old memo engine in `lib/analysis/` and wait 8 s between tickers to stay inside the Twelve Data allowance. It then refreshes insider filings and filing changes until a 50 s deadline.

### Supabase
- Clients:
  - `lib/supabase/server.ts`: per request, with the user's session.
  - `client.ts`: in the browser.
  - `service.ts`: `createServiceRoleClient` bypasses row-level security, for SEC writes and the cron; `createPublicClient` does anonymous reads.
- Migrations are SQL files in `supabase/migrations/` that Eli pastes into the Supabase dashboard by hand; there is no migration runner. Everything through `0028` (the screener's tables and its publish function, pasted 5 and 6 November 2026) is applied, and the next is `0029`.
- The database still holds the social, leaderboard and paper-trading tables. Leave them in place, and don't alter a live table without Eli's sign-off (which is why the version stamps reuse an existing column).
- The untracked top-level `migrations/` folder is a stray copy of the older migrations.

## Product rules (settled, don't reopen)

- **No ratings, scores, verdicts, target prices, fair values, leaderboards or track records** anywhere. Valuation shows "what's priced in" (a reverse DCF), as context only. Copy avoids "buy", "sell", "hold", "undervalued", "overvalued", "upside" and "downside".
- **Free data only, and no paid AI.** Never design a feature around an LLM or Claude API call. The Overview's description is a quote extracted from the company's 10-K, and guidance and "what changed" are worked out by rules.
- **Brand:**
  - Navy, cream and gold tokens. Inter and IBM Plex Mono, loaded from Google Fonts in `app/layout.tsx` (the README's mention of Geist is out of date).
  - Square corners. A calm, editorial voice, not a trading terminal.
  - Theme tokens are defined three times in `app/globals.css` (`[data-theme="light"]`, `[data-theme="dark"]`, and the `prefers-color-scheme` fallback), so a new token goes in all three.
  - Masthead, nav and footer styles are in the phase-ten block at the end of `globals.css`.

## Gotchas (full list with history in `docs/claude-project-context.md`)

- Next 16's documented behaviour has differed from what actually happens here more than once (`error.tsx` boundaries, `notFound()` noindex). Check on a real `next build && next start` with curl, not just against the docs or `next dev`.
- `next dev` doesn't apply the theme colour tokens: the page comes out white and SVG strokes disappear. That isn't a bug. Do visual checks on a production build.
- `unstable_cache` throws outside a Next request, and the public wrappers catch that and return `null`. So a Vitest test that calls a fetcher in `lib/providers.ts` or `lib/sec/*` proves nothing. Test the pure functions against fixtures, and test the wiring through a real route on a running server.
- An `unstable_cache` key covers the wrapped function's own source but not its helpers'. When a helper's output changes shape, add or bump a version in the key parts.
- Keep "this ticker doesn't exist" (404) separate from "the provider is down or rate-limited" (an inline "try again" message). In code, that's `NoTickerDataError` versus a plain `Error`.
- Per-share figures from filings on either side of a stock split are in different-sized shares. Put each on today's basis (`factorAt`, `lib/research/splits.ts`) before combining them. Quarterly cash-flow figures are unwound from year-to-date totals in `normalize.ts`.
- sec.gov refuses headless browsers. Check output drawn from a filing against a saved copy.

## Workflow

- `master` auto-deploys to production on Vercel, and every pushed branch gets a preview deploy. Work on a branch (currently `feat/screener`) and merge to `master` only when Eli explicitly says to go live.
- Phased work follows a brief in its own `docs/phase-<name>/` folder. Each stage ends with a recap in that folder (`docs/phase-<name>/phase-<name>-stage-X-recap.md`), a push, and a stop for Eli to check the preview.
- To find a commit's preview URL without the gh CLI: `GET https://api.github.com/repos/elipoteet/dispatch-web/deployments?sha=<sha>`, then read that deployment's statuses for `environment_url`.
- Eli often has `next start -p 3000` running locally. Ask before rebuilding `.next` or restarting it.
