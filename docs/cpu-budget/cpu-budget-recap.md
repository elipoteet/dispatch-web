# Fitting the site inside Vercel Hobby's 4 hours of CPU (18 November 2026)

Branch `fix/cpu-budget`, from master. Not merged. `feat/screener-home` is untouched and merges cleanly on top of this branch (checked with `git merge-tree`).

On 17 November Vercel paused the whole account for using **13 h 53 min of Fluid Active CPU against the Hobby allowance of 4 hours**. dispatchresearch.com has been down since. The brief: find the cause without guessing, cut the load so the site fits inside 4 hours with room to grow, warn before the next pause, and sketch a move to Netlify or Cloudflare.

## What I could and couldn't see

- **I couldn't open Vercel's usage or logs pages.** This machine has no Vercel login or token, so the per-route ranking the brief asked for has to come from Eli's dashboard (what to send is under "What Eli needs to do").
- **What I measured instead:** CPU per request for every kind of page, on a local production build of master and then of this branch. The server ran behind a guard (`scripts/cpu/local-guard.mjs`) that lets the site read the live database but refuses every write, so nothing in the database changed. Windows counts CPU in 15.6 ms steps, so figures under about 20 ms are noise.

## The cause

Each suspect, confirmed or ruled out:

| Suspect | Verdict | Evidence |
|---|---|---|
| Nightly screener job | Ruled out | 12 s of CPU per run (a dry run: real SEC downloads, nothing written; 100 s of wall time, mostly waiting on the SEC, which isn't billed). It ran on Vercel at most four times before the pause: about 1 minute in all. |
| Manual reruns after the Compounder merge | Ruled out | They ran on my machine. The script calls the job directly, so they used no Vercel CPU at all. |
| Jobs running on preview deployments | Ruled out | Vercel calls cron paths only on the production deployment (Vercel's cron docs). My own checks of previews loaded about 250 pages: at most 2 minutes. |
| Screener pages rebuilt on every visit | Confirmed, but small per visit | Every page on the site was rebuilt on every visit, not only the screener's (below). A screener page cost 44 to 97 ms. How much that added up to depends on visit counts, which only Vercel's numbers show. |
| **Every page rendered per request** | **Confirmed** | The site-wide layout asked Supabase who was signed in, on the server, so no page could be cached. Even About, Give and the 404 page were rebuilt for every crawler hit, and the proxy asked Supabase again on every request. |
| **Crawlers reading research files** | **Very likely the bulk** | Research tabs were the heaviest pages: Valuation about 1 s of CPU a visit, Earnings 0.6 s, all six tabs of one company 2.15 s. Before the screener went live on 14 November, about 163 companies had stored research files. Now 52 of 52 companies sampled across the screener's whole list do. A company's file is stored on its first visit, so something opened research files for nearly all 4,600 companies the screener links to, in three days. At 2.15 s a company, one full pass over those files costs about 3 hours of CPU, and a few crawlers doing one pass each fits 13 h 53 min. |

The crons, the reruns and the previews add up to at most about 35 minutes. That bound counts the alerts job's 60-second limit as if it were all CPU, which it isn't: it mostly waits. So at least 13 h 20 min came from pages served on production. Vercel's Observability page will rank them.

## What changed (`fix/cpu-budget`, four commits)

1. **Research pages cost a third as much.**
   - The split check sorted twelve years of prices again for every trading day. It now gives the same answer in 9 ms instead of 181; a test keeps the old method as the reference.
   - Every ticker lookup re-read the SEC's 924 KB ticker list from the cache. One Valuation visit did that a dozen times. The parsed list is now kept for ten minutes.
2. **Pages that are the same for everyone are cached.**
   - Who is signed in is now read in the browser, so the layout no longer stops pages being cached. A signed-in member sees "Sign in" switch to their account a moment after the page loads.
   - Home (rebuilt at most every 5 minutes for the markets tape), About, Give, the 404 page, /screener and the fourteen starting screens are served from Vercel's cache, with no code running per visit.
   - The screener pages refresh right after the nightly job publishes, or every six hours if that is missed.
   - A screener link with filters, a sort or "show more" is still built per request, at the same address. Titles, counts and noindex rules are unchanged; all fourteen screens and the custom links were checked on `next start`.
   - The proxy now runs only on research, screener and member API addresses, and no longer calls Supabase on every page.
3. **The scheduled jobs run only on production.** A preview refuses them, even with the secret.
4. **robots.txt:**
   - Crawlers are kept out of screener and research links with query strings. Every combination of sort, filter and "show more" was its own address, so a crawler following them never ran out.
   - AI training crawlers are turned away: GPTBot, CCBot, ClaudeBot, Bytespider, Amazonbot, Meta's and others. Search engines and assistants fetching a page for a person are not affected.
5. **A warning at 70%.** A daily GitHub Actions check reads Active CPU with Vercel's CLI and opens a GitHub issue at 70% of the 4 hours, then comments again at 85% and 100%. GitHub emails the issue. If the check can't read the figure, the run fails, and GitHub emails that too. It needs one secret (below).

### CPU per request, before and after

Local production build; the cached pages cost nothing at all on Vercel, because no code runs.

| Page | Before (ms) | After (ms) |
|---|---|---|
| Home, About, Give | 28–34 | cached |
| A bot probe (404) | 16 | cached |
| /screener | 44 | cached |
| A starting screen | 91–97 | cached |
| A custom screener link | 78–87 | 72–137, unchanged; crawlers asked to skip |
| 500 rows | 381 | 353 |
| Research: Overview, Financials | 153, 103 | 127, 73 |
| Research: Valuation | 962 | 155 |
| Research: Earnings | 625 | 77 |
| Research: Insiders, Filings | 147, 156 | 153, 97 |
| **All six tabs of one company** | **2,146** | **682** |
| A company's first Overview of the day | 284 (40 companies) | 238 (12 companies) |

## Before and after, per month

- **Before:** 13 h 53 min, the period that paused the account.
- **After, at the same traffic:** it depends on what that traffic was, and only Vercel's per-route numbers say.

| If the 13 h 20 min of page traffic was… | After this branch |
|---|---|
| All crawlers reading research files, and they keep coming | about 5 h: **still over 4 hours** |
| As above, with half of it from AI training crawlers, now turned away | about 2 h 45 min: under, but with little room |
| Mostly the pages that are now cached | well under 1 hour |

A company's crawl, counting its first render of the day, falls from about 2.3 s to 0.8 s. The figures include the jobs, about 15 minutes a month, and the cached pages' own rebuilds, about 10 minutes. A new site's first full crawl is usually heavier than the re-crawls that follow, so the paused period may overstate a normal month, but only the daily chart can show that.

**Plainly: this branch alone does not guarantee the site stays under 4 hours.** It does in every case except the one the evidence points to: crawlers reading thousands of research files. In that case it depends on how much of the crawling came from AI training crawlers. Three further levers, each Eli's call:

- **A. Vercel Firewall, AI Crawlers: Deny.** No code, two minutes in the dashboard. It turns them away before any code runs, including the ones that ignore robots.txt. Recommended now.
- **B. Search engines read only Overview and Financials.** One line in robots.txt. A company's crawl drops from about 0.8 s to 0.3 s, so even the worst case above falls to about 2 h 15 min. The cost: the other four tabs stop appearing in search results.
- **C. Crawlers get a cached copy of each research page**, refreshed at most monthly, while people keep getting live pages. Crawler cost would then be capped near 1 hour a month however many crawlers come. About half a day of work. First check on the Usage page how much cached-page storage (ISR writes) Hobby allows, so this doesn't hit a different limit.

## What Eli needs to do

1. **Contact Vercel support to unpause.** Vercel's docs say a paused Hobby team "doesn't resume on its own" when the 30 days end, so Dec 17 alone won't bring the site back: vercel.com/help.
2. **Send me the numbers** (screenshots are fine), so I can confirm the ranking:
   - Usage, set to Last 30 days: the Active CPU chart, day by day.
   - Observability, Vercel Functions, sorted by Active CPU: the top routes.
3. **Firewall, Rules, Bot Management: AI Crawlers to Deny** (lever A). Leave AI Assistants on Allow.
4. **Turn on the warning.** Create a token at vercel.com/account/tokens, with an expiry date. In GitHub, add it as a repository secret named `VERCEL_TOKEN` (Settings, Secrets and variables, Actions). Then run "Vercel usage check" once by hand from the Actions tab and check it prints the Active CPU figure. GitHub turns scheduled checks off after 60 days without a commit; it emails first.
5. **Decide on levers B and C,** after the numbers.
6. **Merge:** `fix/cpu-budget` goes to master on your word, then `feat/screener-home` on top. The account is paused, so previews won't build until it's unpaused.

## Checks

- Type-check clean; 682 tests pass; lint at the baseline (4 errors and 1 warning, all pre-existing); `npm run build` clean.
- The build's route table:
  - Cached: home (5 min), About, Give, 404, /screener and the 14 screens (6 h).
  - Per request: research pages, custom screener links, APIs, crons.
- `next start`, checked request by request:
  - Cached pages answer from the cache.
  - Screener links with "?" render per request, with the right titles, counts, sorts and noindex.
  - An unknown screen is a 404; a retired screen and uppercase research addresses redirect.
  - robots.txt has the new rules.
  - Both crons refuse without the secret, and the revalidate route refreshes /screener.
  - The guard refused no writes: nothing tried to change the database.
- New tests: the cron gate (production only, secret required), the split check (identical to the old method on twelve years of noisy prices), and the warning (reads the CLI's JSON, warns at 70%, 85% and 100%, fails loudly).

## About page

Read against the site after the change. No feature was added, removed or renamed, so it is unchanged.

## Tools left in the repo

- `scripts/cpu/local-guard.mjs`: preload it to run the site locally against the live database without writing.
- `scripts/cpu/measure.mjs`: CPU per page on a production build.

## Update, 21 November 2026: the watcher replaces the usage check

The daily usage check (point 5 above) failed on its first run, and it can't work on Hobby. Run from GitHub Actions with Eli's token, Vercel answered:
- 404 for the personal account.
- "User not found" when given the team.
- "Plan not found" (404) from the billing endpoint itself, `POST /v2/billing/costs`, for dispatchteam.

A Hobby team exposes no usage numbers through the API or the CLI.

In its place is the daily watcher (`docs/watcher/watcher.md`). It checks the site and the paused page, the cached pages, both jobs, the starting screens' counts, Supabase and Twelve Data's credits, and it opens a GitHub issue when something needs action. Points 4 and 5 under "What Eli needs to do" are replaced by the watcher's secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `TWELVE_DATA_API_KEY`.
