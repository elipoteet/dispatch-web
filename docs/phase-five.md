# Phase Five — Research Inside the Site

Branch `feat/social-v1`. Read `docs/product-spec.md` (v2), `docs/state-of-play.md`, and
`docs/claude-project-context.md` first. The visual reference is `docs/prototype-v2.html`
— specifically its `vTicker()` and `vResearch()` views.

## Why this phase exists

Today, `/research` on `try.dispatchresearch.com` renders inside `app/(research)/layout.tsx`
— the **retired product's** shell. A student who clicks "Research" in the left nav is thrown
out of the social app into the old equity-research tool: the Masthead, the old TopNav with
Portfolio / Leaderboard / About / Give Back, the "Brief me on any ticker" desk, the Time
Machine, and a memo ending in a **rule-based buy/hold/sell verdict** built from a 1–10
scorecard.

The spec forbids any rating, score, or track record anywhere in this product. Right now the
new site ships one, two clicks from the feed. That is the bug this phase fixes.

The goal is the thing the spec promises: **every ticker mentioned anywhere is one click from
that company's page, and that page lives inside the conversation, not beside it.**

## Decisions already made — do not relitigate

- **Ticker page depth: the prototype version.** Header, chart, six numbers, and every post
  about that ticker. No scorecard, no verdict, no prose memo, no risks/catalysts blocks, no
  Time Machine. Approved explicitly after reviewing a deeper alternative.
- **The Leaderboard is hidden on this branch.** (Pricing was also to be hidden but no
  `pricing/` route exists any more — confirm and report.) Portfolio, About and Give Back stay
  reachable by URL. Nothing is deleted; `master` and dispatchresearch.com are untouched.
- **URLs stay `/research` and `/research/[ticker]`.** Only the shell they render in changes.
  This preserves the existing sitemap entries and means no redirects are needed.

## A. The ticker page — `/research/[ticker]`

Move it into the social route group so it inherits `app/(social)/layout.tsx` (header, left
nav, footer, ticker tape, and the `.social` class that carries the loosened radius).

Top to bottom, matching `vTicker()`:

1. **Header.** Symbol large, then `Company Name · Industry` beneath it. Right-aligned: last
   price, and today's change with the up/down colour treatment already used on post ticker
   cards.
2. **One action: "Post about $SYM."** Opens the composer with the ticker pre-attached.
   *Not* "Add to watchlist" — the prototype shows that button but watchlists are deferred and
   do not exist. Do not build one here.
3. **"What the network is saying"**, with a post count. Every public post whose attached
   ticker is this symbol **or** whose body contains `$SYM`, newest first, rendered with the
   existing `PostCard` so pushback, edit markers and tombstones behave identically to the
   feed. Empty state: "Nobody has posted about $SYM yet. Be first."
4. **"The numbers"**, subtitled *supporting the argument*. A one-year price chart with the
   52-week low and high labelled beneath it, then six stats in a fixed three-column grid
   (`repeat(3, minmax(0,1fr))` — auto-fit leaves a grey hole at six items, this was already
   hit once): **Market cap, P/E, Rev growth, Gross margin, Avg volume, Posts.**

The prototype's sixth stat is "On watchlists." Watchlists do not exist. Replace it with
**Posts** — the count of posts mentioning this ticker, which is a database count and free.

Section order matters and is deliberate: the conversation sits **above** the numbers. The
numbers support the argument; they are not the point of the page.

### Where the data comes from — read this before writing any fetch

`lib/analysis/tickerSnapshot.ts` already does almost all of this, is **100% Finnhub**, and
deliberately avoids `loadReport`/`fetchPrices` because those hit Twelve Data's 8-requests-per-
minute ceiling. It already returns name, price, day change, P/E, revenue growth, gross margin,
and the 52-week high/low.

**Extend `getTickerSnapshot` rather than writing a second fetcher.** It already awaits the
full `fetchFundamentals` response; three more fields are sitting in it unused, at **zero
additional request cost**:

- `profile.marketCapitalization` → Market cap
- `profile.finnhubIndustry` → the industry line in the header
- `metrics["10DayAverageTradingVolume"]` → Avg volume (via the index signature, same pattern
  as `grossMarginTTM`; **confirm the exact key against a live response** before trusting it —
  that convention has bitten this file before)

That leaves the **chart** as the only expensive part of the page, since price history means
Twelve Data. Wrap that call in `unstable_cache` from `next/cache` with a long revalidate —
daily closes change once a day, so a 12–24 hour cache keyed on the symbol is correct, not a
compromise. A plain in-memory `Map` will not survive between serverless invocations; this has
already been established. Budget: **one Twelve Data request per ticker per day.**

If the chart data fails or is rate-limited, **render the page without the chart** — stats and
posts still work. Do not throw. `error.tsx` boundaries are unreliable in this Next version;
handle it in the component's own render.

Keep the existing `NoTickerDataError` / plain-`Error` distinction: a symbol Finnhub confirms
does not exist should 404 via the existing `not-found.tsx`; a provider being down should show
"temporarily unavailable" on a normal 200.

## B. The research desk — `/research`

Also moves into the social group. `vResearch()`'s header line is the brief for the whole page:
*"Look up any ticker. Everything here is also one click away from any post."*

- A single search input, uppercase mono placeholder `TICKER OR COMPANY`. Enter navigates to
  `/research/[ticker]`.
- Below it, a grid of ticker cells.

**Do not build the prototype's grid literally.** It shows a static set of symbols with live
prices, which would fire a provider request per cell on every load and blow the quota by
itself. Instead the grid should show **the tickers people on the site are actually posting
about** — read from the frozen snapshot JSON already stored on each post at publish time.
That costs **zero** provider calls, stays current on its own, and is far more on-brand: the
research desk becomes a map of what the campus is talking about rather than a static watch
grid. Order by number of recent posts. If the site has no posts with tickers yet, show the
search box alone with a quiet empty state.

Everything the old desk did that is not the search box — the Time Machine, the example ticker
chips, the memo framing — does not come across.

## C. Make cashtags clickable

This is what makes the whole phase true. Right now `$NVDA` in a post body is plain text.

Linkify `$SYMBOL` in post and reply bodies to `/research/[symbol]`, matching the prototype's
`linkify()`: `/\$([A-Z]{1,5})\b/`. Style it as the existing `.cash` treatment. Do this in the
shared render path so it cannot be forgotten on one surface — the same lesson as the "from a
space" kicker, which went missing on two of three pages until the logic moved inside
`PostCard`.

Linkify the ticker on the attached data card too, so the card header is a link to the page.

Leave `#theme` alone — themes are deferred.

## D. Nav and cleanup

- Left nav "Research" points at `/research` and now stays inside the app. Verify the active
  state highlights correctly.
- **Hide the Leaderboard on this branch.** Remove its `TopNav` entry and its `sitemap.ts`
  entry. Leave the route files in place. Do not touch `master`.
- Confirm whether a `pricing/` route still exists; if not, say so and change nothing.
- Check that no link anywhere in the social shell (footer included) still points into the old
  research chrome.
- Phase four's item 5 was "ticker search in the left rail." If it is quick, wire the rail
  search box to `/research/[ticker]`. If not, leave it — it is phase four's, not this one's.

## What not to build

No watchlists, no public/private toggle, no themes, no Time Machine, no scorecard, no
verdict, no prose memo, no risks or catalysts blocks, no news section, no "more numbers"
drawer. Every one of these was considered and deliberately left out.

## Before you call it done

1. `npx tsc --noEmit` and `npm run build` both clean. (`npm run lint` fails on ~8 pre-existing
   `react-hooks/set-state-in-effect` errors — do not add new ones.)
2. Run a real `next start`, not just `next dev`, and hit the pages with `curl`. Documented
   Next behaviour has repeatedly not matched actual behaviour in this version.
3. Open `/research/NVDA` **in an incognito window** and confirm: no Masthead, no old TopNav,
   no Leaderboard link, and **no rating or score anywhere on the page**. Search the rendered
   HTML for "buy", "hold", "sell" and for the composite score to be certain.
4. Click a `$TICKER` inside a real post in the feed and confirm it lands on the right page.
5. Click one inside a **space** post and inside a **reply** too — three surfaces, one shared
   render path.
6. Confirm an unknown symbol 404s and a provider failure does not.
7. Load the same ticker page twice and confirm the second load makes no new Twelve Data
   request — the cache is the whole rate-limit plan.
8. Check it at 390px. Nothing on this branch has ever been tested at phone width.

Report what you changed in plain language: what a student now sees when they click a ticker,
and anything you found that this brief got wrong.
