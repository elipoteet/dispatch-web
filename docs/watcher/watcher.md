# The watcher (Phase 1, 21 November 2026)

A plain script, `scripts/watcher/watch.mjs`, run once a day at 12:17 UTC by `.github/workflows/watcher.yml`. It only reads: it never writes to the database, and it doesn't use AI.

It opens a GitHub issue, which GitHub emails to Eli, only when something needs action:
- The issue is called "Watcher: N things need attention".
- When the list of problems changes, the same issue is edited and gets a comment.
- When everything is clear again, it closes itself.

Each Monday it also posts a short weekly summary ("Watcher: week of …") and closes the previous one.

## Why there's no Vercel usage alarm

Vercel paused the whole account on 17 November 2026, at 13 h 53 min of Active CPU against the Hobby plan's 4 hours. Vercel doesn't let a Hobby team read its usage:
- `vercel billing usage` and the endpoint it calls (`POST /v2/billing/costs`) answer "Plan not found" (HTTP 404) for dispatchteam.
- Per-route metrics need the paid Observability Plus.

So the watcher checks what can be seen instead: whether the pages that must be cached still are, and whether the site is up.

## The checks, and what to do when one fires

| Check | Fires when | What to do |
|---|---|---|
| Live site | The home page isn't a 200, or Vercel shows its pause page ("DEPLOYMENT_PAUSED" on 17 November, "402 DEPLOYMENT_DISABLED" on 25 November 2026; three tries, 30 s apart) | Paused: the Usage page shows which allowance went over, and Vercel support (vercel.com/help) unpauses. Down: the Vercel dashboard and vercel-status.com |
| Cached pages | /screener or The Compounder is rebuilt per visit instead of served from Vercel's cache | A page rebuilt per visit spends Active CPU. Check the last build's route table (docs/cpu-budget/cpu-budget-recap.md) |
| Screener job | No run in 26 hours, a run that failed or never finished, a run that kept yesterday's figures, or the published table older than 26 hours | Vercel's Cron Jobs page, and the newest `screener_runs` row: its error, or `companies_skipped["not published because"]` |
| Alerts job | No watched ticker checked in 26 hours. It is skipped when no one watches a ticker, because the job then leaves no trace | Vercel's Cron Jobs page for /api/cron/alerts. It needs Twelve Data prices, so check that row too |
| Screen counts | A starting screen below 5 companies, under half or over double its usual count, missing from /screener, or the universe outside 4,000–5,500 | Open the screen and the newest `screener_runs` row. Usual counts are in `BASELINES` in the script: update them if a change was deliberate |
| Supabase | The database doesn't answer a read | A paused or unreachable project: the Supabase dashboard |
| Twelve Data credits | 70% of the 800 daily credits used at check time, the credits used up (429), or the key refused | Find what is spending them. On 21 November 2026 they ran out by noon UTC (1,628 used): most likely crawlers opening research files, one price request per company |
| Vercel Active CPU | Not on Hobby: always "skipped". On a plan where Vercel gives usage, it fires at 70% of 4 hours | Observability, Vercel Functions, sorted by Active CPU |

## Safety

- **Read-only, with the public key.** The watcher's only database request is a GET of `watcher_status()` (migration 0031), which returns five numbers about the jobs and no rows. It uses the public key, which can't read the jobs' tables or write anything (checked 25 November 2026: on the live database it sees 0 of 14 watchlist rows, 0 of 21 alert snapshots, 0 of 33 screener runs; on a copy built from every migration, its inserts, updates and deletes were refused on every table). The script's `fetch` also refuses any method but GET to the database's host. Tests check both.
- **No secrets in logs.** Keys travel only in request headers, and everything printed is scrubbed of every secret's value. GitHub also masks secrets.
- **Secrets it reads,** set under the repository's Settings, Secrets and variables, Actions:
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public key, the same one the site's pages carry), for the job and Supabase checks. Until migration 0031 is pasted, those checks say "skipped". The service-role key is not used.
  - `TWELVE_DATA_API_KEY`. Each check costs 1 of the 800 daily credits.
  - Optionally `VERCEL_TOKEN`, which gives nothing on Hobby.
- **A missing secret** makes its checks "skipped", never an alert.

## Free-plan limits (as published, checked 21 November 2026)

- **Vercel Hobby:** 4 hours of Active CPU a month for the account, among others. Going over pauses every deployment until Vercel support unpauses it.
- **Supabase Free:**
  - 500 MB database.
  - 5 GB egress, plus 5 GB of cached egress.
  - 50,000 monthly active users.
  - 1 GB file storage.
  - 500,000 edge function invocations.
  - 200 realtime connections and 2 million realtime messages.
  - 2 active projects.
  - **Free projects are paused after 1 week of inactivity;** the site's daily traffic and jobs keep it active.
  - Supabase's pages don't say what happens to a free project over a limit, and give no usage API.
- **Twelve Data Basic:**
  - 8 credits a minute and 800 a day, reset at midnight UTC.
  - US equities, forex and crypto, 3 markets.
  - "Internal non-display usage" is listed as a Basic feature.
  - HTTP 429 when used up.
  - The usage endpoint (`/api_usage`) costs 1 credit a call.

## Running it locally

```bash
node --env-file=.env.local scripts/watcher/watch.mjs
```

With no `GITHUB_TOKEN` set, it only prints. To make sure nothing can write, preload the local write guard as well: `NODE_OPTIONS=--import=file:///…/scripts/cpu/local-guard.mjs`.
