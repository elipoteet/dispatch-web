# The Dispatch — Claude Project Context

Paste this file into a Claude Project's knowledge (along with `ARCHITECTURE.md` and
`AGENTS.md` from the repo root — see "What else to upload" below). It's written so a
fresh Claude conversation can pick up this project with no prior history.

## What this is

**The Dispatch** is an equity-research web app. A visitor types a U.S. stock ticker and
gets back a structured research memo in a few seconds — scorecard, fundamentals,
technicals, sentiment, risks, catalysts, and an overall rating — built fresh from real
market data every time, not templated boilerplate. It also has a paper-trading portfolio
feature and a "Time Machine" that rebuilds any past memo as it would have read on a
prior date.

Solo project. Built and run by **Eli Poteet**, a finance student at the University of
New Hampshire. Not a company, no team — see the "Who's behind this" section on the
`/about` page for the honest framing already established for the site's own copy.

- **Live site:** https://www.dispatchresearch.com
- **GitHub:** https://github.com/elipoteet/dispatch-web (branch: `master`)
- **Fallback/staging URL:** https://dispatch-web-psi.vercel.app (same deploy, Vercel's
  default domain — useful if the custom domain is ever misbehaving)
- **Hosting:** Vercel, auto-deploys on push to `master`
- **Database/auth:** Supabase (Postgres + Auth — Google OAuth and email/password)
- **Market data:** Twelve Data (prices) and Finnhub (fundamentals/news/estimates), both
  free-tier, both server-side only

## Tech stack

- Next.js **16.2.10** (App Router, Turbopack) + React 19 + TypeScript
- `@supabase/ssr` + `@supabase/supabase-js` for auth and Postgres access
- No other runtime dependencies — deliberately lean

## Where things live (see `ARCHITECTURE.md` for the full map)

- `app/` — pages: home, `about/`, `research/` (search desk + `research/[ticker]/` for
  server-rendered memo pages), `portfolio/` (paper trading), `pricing/`
- `app/api/` — `analyze/[ticker]` (client-side memo fetch), `watchlist`,
  `tape` (homepage ticker strip), `portfolio/*`
- `lib/analysis/` — the scoring engine: `indicators.ts`, `scoring.ts`, `report.ts`,
  `loadReport.ts` (shared fetch/build logic), `historical.ts` (Time Machine)
- `lib/providers.ts` — Twelve Data / Finnhub fetch wrappers, server-only
- `lib/portfolio.ts` — paper-trading math
- `lib/supabase/`, `lib/db.ts` — Supabase clients
- `components/` — `research/`, `portfolio/`, `layout/`, `auth/`
- `proxy.ts` — session-refresh middleware (Next 16 renamed `middleware.ts` → `proxy.ts`)

## Environment variables required

Set in `.env.local` locally and in Vercel's project settings for production:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
TWELVE_DATA_API_KEY
FINNHUB_API_KEY
```

(Values are secrets — never commit them, never paste them into a Claude conversation.)

## Brand / design rules — apply these without being asked

- **Palette:** navy `--navy`, cream `--cream`, gold `--gold` accent, plus `--accent`
  (red/error), `--green` (positive). All defined as CSS custom properties in
  `app/globals.css` that flip values under `[data-theme="dark"]` / `prefers-color-scheme`
  — light and dark are both first-class, not an afterthought.
- **Typography:** Inter (body/UI) + IBM Plex Mono (labels, data, uppercase micro-copy
  with wide letter-spacing). This pairing is load-bearing for the site's "newspaper
  research desk" feel — don't swap it casually.
- **Zero border-radius, everywhere**, deliberately — the one exception is the logo
  mark itself. This is a strict, intentional brand constraint, not an oversight.
- **Voice:** calm, editorial, declarative. "Do less, read more, stare at fewer charts."
  Explicitly *not* a trading terminal — the site says so on `/about`. Avoid hype copy,
  avoid "institutional-grade" style language (deliberately removed from the homepage
  hero for undercutting the "written for readers" positioning).
- **Logo mark:** a navy "D" with a gold ascending-arrow line through it (rounded bowl,
  rounded joints), defined as inline SVG in `components/layout/Logo.tsx` and hardcoded
  light-mode-only in `app/icon.svg` (favicons render outside page CSS context).

## Known, hard-won gotchas — read before touching Next.js internals

`AGENTS.md` already warns: **this Next.js version has real breaking changes from
older training data — read `node_modules/next/dist/docs/` before writing code that
touches routing, caching, or metadata.** Specific traps already hit and worked around
in this codebase:

1. **`error.tsx` route boundaries are unreliable in this exact Next 16.2.10 +
   Turbopack setup.** Documented, standard `error.tsx` (with `unstable_retry`) was
   built and tested for `/research/[ticker]` — it worked on the *first* render pass
   (confirmed via the raw RSC payload) but a subsequent re-render sometimes fell
   through to the framework's generic "page could not be found" fallback instead,
   even in a minimal, completely isolated repro unrelated to this route. **Verify
   any `error.tsx` you add actually works with a real forced-throw test before
   trusting it** — don't assume the documented behavior holds. The current
   workaround: handle recoverable failures directly in the page component's own
   render (a normal 200 response with inline messaging) instead of throwing to a
   boundary.
2. **`notFound()`'s documented automatic `noindex` injection doesn't reliably apply
   once a custom `not-found.tsx` exists for that segment**, at least not in local
   testing here. Set `robots: { index: false }` explicitly in `generateMetadata`'s
   catch/fallback path instead of trusting the automatic behavior.
3. **Twelve Data's free tier is 8 requests/minute — this is tight.** The homepage
   ticker tape (`app/api/tape/route.ts`) used to fire 9 symbols at once on every cold
   load, exceeding the limit *by itself* before any visitor searched anything. Fixed
   by capping it at 5 symbols with a 10-minute cache. If you add anything that fires
   multiple Twelve Data calls in a burst (a new tape, a batch quote feature, etc.),
   budget against this 8/minute ceiling and leave headroom for concurrent user
   searches sharing the same quota.
4. **Distinguish "this ticker doesn't exist" from "the provider is rate-limited/down."**
   `lib/providers.ts` throws `NoTickerDataError` specifically when Twelve Data
   confirms no data for a symbol, vs. a plain `Error` for HTTP-level failures
   (429, 500, network). `lib/analysis/loadReport.ts` converts `NoTickerDataError`
   into `TickerDataError`, which the research page 404s on; a plain `Error` shows a
   "temporarily unavailable, try again" message instead. Keep this distinction if
   you touch this path — collapsing it back into one generic error message was
   exactly the bug that got fixed.
5. **`unstable_cache` (from `next/cache`) is the right tool for durable, per-argument
   server-side caching on Vercel** — a plain in-memory `Map` (see `lib/cache.ts`)
   does *not* reliably persist across separate serverless invocations. There's an
   unmerged branch (`feat/provider-cache`, pushed but not merged — ask before
   merging) that moves provider-response caching from the in-memory `Map` into
   `unstable_cache`, wrapping each `lib/providers.ts` function individually so every
   caller shares one cache entry per symbol. It also fixes a real gap: `fh()`
   (the Finnhub helper) swallows failures to `null`, which could otherwise get
   durably cached as "no data" for a transient Finnhub hiccup — the branch only
   treats it as a real failure when *all five* parallel Finnhub sub-requests come
   back null.
6. **Always verify empirically, not just against docs.** Multiple times this
   session, documented Next.js behavior didn't match actual behavior in this
   specific version/bundler combo. When in doubt: build, run a real server
   (`next start`, not just `next dev`), and hit it with `curl` (or force a
   deterministic failure) rather than trusting what should happen.

## Workflow conventions already established

- **Small fixes / content edits:** commit directly to `master`, push, then poll
  production (`curl` the live URL) to confirm the deploy landed before reporting done.
- **Bigger features:** create a branch, push it, but **do not merge or open a PR
  unless explicitly asked** — the user reviews on GitHub first and says "merge" when
  ready.
- **Always run `npx tsc --noEmit` and `npm run build` before considering something
  done.** `npm run lint` currently fails on ~8 pre-existing `react-hooks/set-state-in-effect`
  errors unrelated to any single change (never cleaned up) — don't be alarmed by
  that specific failure, but don't add new lint errors either.
- Test files/scratch servers: never commit them; clean up (`kill` background
  `next dev`/`next start` processes, delete scratch curl output files) before
  finishing.

## Current state / what's already done

Phases 1–4 of the original migration (from a single static HTML file) are complete:
auth, live price proxy, watchlist, paper trading. Since then: mobile responsiveness
pass, candlestick charts (dark mode) / line chart (light mode) toggle, full brand
identity (logo, OG images, brand guidelines), SEO audit fixes (robots.txt, sitemap.xml,
canonical tags, metadataBase pointed at the real domain), server-rendered per-ticker
memo pages at `/research/[ticker]` (the biggest SEO lever — real content in the initial
HTML instead of a client-fetched empty shell), a founder's note + real contact info on
`/about`, and the rate-limit/error-messaging fixes described above.

## What's not done / open threads

- `feat/provider-cache` branch: built, tested, pushed — **not merged**. Ask before
  merging; it will likely conflict with anything else touched in `lib/providers.ts`
  or `lib/analysis/loadReport.ts` since master diverged from it.
- The `notFound()` → `noindex` metadata gap (gotcha #2 above) has a best-effort fix
  but wasn't fully confirmed working in local testing — worth re-checking on the
  live domain if SEO of bad-ticker URLs ever matters.
- Business/positioning decisions flagged by the site audit but deliberately left to
  the user's judgment, not yet acted on: free-tier-cannibalizes-paid-tier pricing
  restructure, deeper risk-engine coverage for "clean" mega-cap tickers, and the
  "not a terminal" positioning vs. the Buy/Sell rating badge + paper-trading button
  sitting right next to it.

## What else to upload to the Claude Project

- `ARCHITECTURE.md` (repo root) — plain-language explanation up top, full technical
  diagram/file-map/security-notes in a collapsed appendix at the bottom.
- `AGENTS.md` (repo root, also aliased as `CLAUDE.md`) — the one-line but important
  warning about this Next.js version's breaking changes.
- This file.

## Suggested Project custom instructions (paste into the Project's instructions field)

> This project is **The Dispatch**, a solo-built equity-research web app
> (dispatchresearch.com, GitHub: elipoteet/dispatch-web, Next.js 16 + Supabase +
> Vercel). Read `claude-project-context.md` in this Project's knowledge before
> starting any work — it has the tech stack, brand rules, and several hard-won
> Next.js 16 gotchas (particularly: `error.tsx` boundaries are unreliable in this
> setup, verify anything routing/caching/metadata-related empirically rather than
> trusting documentation). Match the existing brand voice (calm, editorial, zero
> border-radius, navy/cream/gold, Inter + IBM Plex Mono) in anything user-facing.
> Small fixes go straight to `master` and get pushed once verified; bigger features
> go on a branch that gets pushed but not merged without explicit sign-off.
