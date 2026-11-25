# Twelve Data credits and the alerts job (25 November 2026)

Branch `fix/price-credits`, from master. Not merged.

## What was wrong

- Twelve Data's free plan allows 800 price requests a day, reset at midnight UTC. On 21 November the site had used 1,628 by noon; on 24 November, 2,141 by 17:47 UTC.
- Crawlers did it. Every research tab loaded a company's 20-year daily prices, cached for a day, so each company a crawler opened cost one request. Once the day's 800 were gone, failures weren't cached, so every later visit asked again, then asked Tiingo, whose hourly allowance was used up too.
- The alerts job ran at 21:30 UTC, long after the credits were gone, so no ticker had been checked since 19 November. Separately, 12 tickers 8 seconds apart is 96 seconds against a 60-second limit, so four tickers hadn't been checked since late August.
- The screener and the home page spend no Twelve Data credits.

## What changed

1. **Crawlers never fetch prices.** A crawler gets the research page's text, figures and facts, without the chart, the 52-week range, Valuation's comparison with its own history, or (for companies checked for stock splits) Earnings' EPS by quarter. The chart's on-demand ranges (1D, 1W, MAX) turn crawlers away. People see no difference.
2. **Out for the day means out.** When Twelve Data answers that the day's credits are used up, nothing asks it again until midnight UTC. A Tiingo refusal stops Tiingo until its cap resets (an hour, midnight New York time, or the 1st of the month).
3. **The alerts job moved to GitHub** (below).
4. **Last known prices, dated.** When the latest prices can't be fetched, the chart shows the newest stored copy from the last two weeks, labelled "Daily closes through Nov 21, 2026. Newer prices couldn't be loaded", and the 52-week range says "Range through Nov 21". Otherwise the label says "Daily closes through" the last session. The price at the top of the page is Finnhub's live quote, as before.
5. **Once per trading session.** Daily prices are cached per finished session (5 pm New York time on trading days), not per day, so Friday evening's copy serves the weekend and Monday morning. A fetch during trading hours drops today's unfinished bar, so the chart's last daily close is always a real close.
6. **A daily reserve.** Requests for visitors stop at 600 a day; the alerts job may go on to 790, leaving 10 for the watcher and checks. Counted in one shared row per day (migration 0032). Until it's pasted, each server instance counts for itself, which still stops one instance at 600 but isn't exact across several.

Not done, as decided: a 7-day cache for the split check, and a 15-minute intraday cache.

## The alerts job

- **Where it ran:** a Vercel cron, `/api/cron/alerts`, at 21:30 UTC, everything in one 60-second request.
- **Now:** `.github/workflows/alerts.yml` runs `scripts/alerts/run.mjs` at 00:23 UTC, just after Twelve Data's credits reset. The script calls the route one step at a time: the watched tickers, then each ticker, 8 seconds apart, then the SEC refreshes. Each call takes seconds, so no overall time limit applies however many tickers there are. The work still runs on Vercel (a few seconds of CPU a night) because that's where the research pages' price cache is: a ticker someone opened after the close costs no credit.
- **Rules** (`lib/alerts/decide.ts`):
  - Prices must run through the latest finished session, or the ticker is skipped and not marked checked.
  - If the last check is more than two sessions back, the ticker is quietly re-baselined: its state is recorded and nothing is sent. Alerts resume from the next session. So an outage never produces a burst of old alerts.
- **Dry run before the first real run** (local, on the 12 tickers' real prices to 24 November, replayed from a copy saved at 00:12 UTC on 25 November; nothing written):
  - All 12 re-baselined, nothing sent: AAPL, DELL, META, NVDA, NVTS and PLTR last checked 19 November (4 sessions back); SPY and TSLA 14 November (7); AMZN and JPM 1 September (59); GOOGL 29 August (61); MRVL never checked (first check, nothing sent).
  - Without the new rule, the old job would have sent one stale alert: GOOGL's 50-day average below its 200-day, a cross that happened at some point since 29 August.
- A run started by hand from the Actions tab is a dry run unless the box is unticked.

## Proof, on a local production build

Measured with every outgoing Twelve Data and Tiingo request logged, against the live database with writes blocked.

| Visit | Twelve Data credits | What came back |
|---|---|---|
| Googlebot, Costco Overview | 0 | Full page text and figures; no chart, no 52-week range |
| A person, Costco Overview, first visit | 1 | Chart, "Daily closes through Nov 24, 2026" |
| A person, the same again | 0 | Same, from the cache |
| Googlebot, Walmart and Home Depot Overview | 0 each | Page text; no chart |
| A person, Walmart and Home Depot | 1 each, then 0 | Chart |
| Googlebot, NVIDIA Valuation and Apple Earnings | 0 each | Page text; the price-based sections left out, no "try again" anywhere |
| A person, NVIDIA Valuation and Apple Earnings | 1 each for the split check, then 0 | Full sections |

- **Caching:** master and this branch build exactly the same route table. Every page that was cached (home, About, Give, /research, /screener and its 14 screens) still is; research pages were already built per visit, so reading the visitor's User-Agent there changes nothing.
- **Tests:** 719 pass, plus new ones for the sessions, the budget, the last-known fallback, the alert rules, the Twelve Data gate's day limit, and the write guard. Type-check clean; lint at its baseline.
- **Preview:** not possible. On 25 November Vercel refused to build it ("Account is blocked"), and the live site answers 402 DEPLOYMENT_DISABLED. Today's Twelve Data count shows the live site made no requests after midnight UTC.

## Credits a day, estimated

Assumes people open about 50 companies a day; real visitor numbers aren't measured.

| After | Credits a day |
|---|---|
| Before (24 November) | about 2,900 asked, 800 served |
| Crawlers skip prices | about 80 |
| Out-for-the-day stop | about 80, with near-zero refused retries |
| Alerts at 00:23 UTC on the shared cache | about 70–80, at most 12 for alerts, first in line |
| Last known prices | no change; no repeat attempts |
| Once per session | about 60–70 on weekdays, much less at weekends |
| Reserve | visitors capped at 600 whatever happens |

## A fix found on the way: the local write guard

`scripts/cpu/local-guard.mjs` read the database's address once, when preloaded, but `next start` loads `.env.local` after that, so the guard blocked nothing in the local runs of 18 to 21 November. It now reads the address on every request and covers any Supabase host; a test checks it.

Checked read-only afterwards:
- The local visits of 25 November wrote nothing; those companies' stored figures were already current.
- On 18 November between 02:40 and 03:30 UTC, while the live site was paused, 49 insider-filing rows for one company were stored. Only the local CPU measurements were running then, so they wrote them: public SEC data the site caches on any visit.
- No watchlist, alert or job table was written in any of those windows.

## Supabase downloads

This change doesn't reduce them.
- Every research visit, crawler or person, reads that company's stored figures from Supabase: about 1,100 to 1,300 rows, around 400 KB unpacked and 40 KB compressed (measured for Apple, Costco and NVIDIA).
- Crawlers still need those figures for the page text.
- Prices never came from Supabase; they're cached in Vercel's cache.
- The only database traffic this branch adds is one small call per price request, for the shared count (about 80 a day).

## To do before merging

1. Paste `supabase/migrations/0032_price_credit_ledger.sql`.
2. Add the repository secret `CRON_SECRET` (the same value as on Vercel), for the GitHub schedule.
3. Get the Vercel account unblocked, then check a preview: a crawler visit and a person's visit, and the cached pages' `x-vercel-cache` headers.
4. Merge. Removing the Vercel cron for alerts and starting the GitHub schedule happen together, at the merge.
