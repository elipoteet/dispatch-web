# Direction change, 30 October 2026

Eli has stopped work on Dispatch Social. The revamp now targets the live site, dispatchresearch.com, and turns it into a deep, free research file on every U.S. company. Decided in chat on 30 October. Read this before anything else in the Project.

## Decisions

1. The new dispatchresearch.com is the research file planned in `claude/phase-nine-build-brief.md`: Overview, Financials, Valuation ("what's priced in"), Earnings, Insiders, Filings ("what changed"), a screener and Compare, all on free data (SEC EDGAR plus the Twelve Data and Finnhub free tiers). It stands on its own, with no social layer around it.
2. The scorecard, buy/sell rating and monthly leaderboard on the live site are removed. Nothing on the site delivers a rating, score, verdict, target price, fair value, leaderboard or track record.
3. try.dispatchresearch.com is taken down. Social data in Supabase is left in place and nothing is dropped.

## What this supersedes

`claude/product-spec.md`, `claude/state-of-play.md`, `claude/access-and-indexing.md` and the phase one to eight briefs describe Dispatch Social and are now history, not instructions. `claude-project-context.md` still holds for the stack, brand and Next.js 16 gotchas, but its product description is out of date.

The phase nine brief stays the plan for the research pages, with these changes: the pages live in the live site's own layout rather than the social shell; the Discussion tab, the "From the network" strip and the "Post about $SYM" button are dropped; and Stage 2's rule against regressing the social six-stat page no longer applies.

## Starting point

`master` is what dispatchresearch.com serves: the July memo product, where a ticker produces a scored memo, plus the portfolio simulator, Time Machine, leaderboard, About and Give Back.

`feat/research-v2` holds phase nine Stage 1, the SEC data layer in `lib/sec/` with its tests and the NVDA checks, plus 1D, 1W and 1M chart ranges. It was cut from `feat/social-v1`, so the plan is a fresh branch from `master` that brings over `lib/sec/` and the chart work and leaves the social code behind. Type-check and all 153 tests passed on that branch on 30 October.

The database is shared, so it already carries the social tables, and migration numbering continues after `0021_research_data.sql`. Confirm that 0021 was actually pasted into Supabase before relying on its tables.

## Open, for the next step

What the home page becomes once the memo is gone. Whether the portfolio simulator and sign-in survive (phase nine already kept Time Machine out and brought Compare back). The old `/research/[ticker]` memo URLs should keep working and land on the new research pages.

Claude sessions cannot push to the repo until the Claude GitHub App is installed on it or GitHub is reconnected in claude.ai settings.

## Repo notes (added when this was copied into the repo, 30 October)

- This file is a copy of `claude/direction-2026-10-30.md` from the Claude Project. In this repo, `claude/phase-nine-build-brief.md` is `docs/phase-nine.md`.
- The fresh branch is `feat/research-site`, cut from `master` at `d2cc717`. It carries `lib/sec/`, the chart data layer (`lib/analysis/chartRanges.ts`, `lib/analysis/tickerChart.ts`, the intraday fetch in `lib/providers.ts`, `app/api/ticker-intraday/`), `lib/ticker.ts`, and migrations 0006 to 0021 as a record of what the shared database holds. The on-screen chart component was left on `feat/research-v2`: it is styled for the social shell, and Stage 3 rebuilds it in the live site's look.
- 0021 is confirmed pasted, including the later `source` column: on 30 October, `sec_company` held NVDA and JPM and `sec_financials` held 1,369 rows.
