# Phase Five Recap — for the Claude Project, ahead of Phase Six

Paste this into the Claude Project's knowledge alongside `product-spec.md` (v2),
`phase-four.md`, `phase-four-recap.md`, `phase-five.md`, and `claude-project-context.md`, all
of which live in this repo's `docs/`. Covers moving research inside the social shell — "every
ticker mentioned anywhere is one click from that company's page, and that page lives inside
the conversation, not beside it" — on `feat/social-v1`, pushed, **not merged**.
`master`/production untouched throughout.

## What shipped

**`/research/[ticker]`** moved out of the retired product's own chrome (`app/(research)/`)
into the social shell — header, left nav, footer, all inherited, no separate Masthead/TopNav/
Time Machine. New page structure, top to bottom: header (symbol, name/industry, price, day
change), a "Post about $SYM" button (links to `/?ticker=SYM`, which pre-fills the composer's
body — `Composer.tsx` gained an `initialBody` prop, and `useTickerAttach`'s existing debounced
fetch runs on mount the same as any other body change, so this reuses the exact mechanism
typing `$TICKER` already triggers, not a new one), "What the network is saying" (every public
post whose attached ticker matches or whose body mentions the cashtag, via the same
`PostCard` the feed uses), and "The numbers" (a one-year chart plus six stats in a fixed
three-column grid — market cap, P/E, revenue growth, gross margin, average volume, posts).
**No rating, no score, no verdict anywhere** — confirmed by grepping the rendered HTML for
"buy"/"hold"/"sell"/composite score, not just by not building one.

**`/research`** (the desk) is a search box plus a grid of the tickers people are actually
posting about, read entirely from posts' frozen `ticker_snapshot` JSON — zero provider calls,
unlike the prototype's literal grid (a live price per cell on every load) or the retired
product's static one.

**Cashtags became real links.** `renderCashtags` (the one shared render path used by every
post body) now wraps every `$TICKER` in a link to `/research/[ticker]` — and `ReplyItem.tsx`,
which had been rendering reply bodies as plain text, now calls it too. Same shape as the
"from a space" kicker gap in phase three: a shared surface had silently never been wired in.

**Data**: `getTickerSnapshot` (the existing cached, Finnhub-only fetcher) extended with
`marketCap`, `industry`, `avgVolume` — all three were already sitting unused in the response
it already awaits, at zero additional provider-request cost. The exact metric key names
(`profile.marketCapitalization`, `profile.finnhubIndustry`,
`metrics["10DayAverageTradingVolume"]`) were confirmed against a live Finnhub response before
being trusted, per this file's own prior warning that this convention has bitten it before.
The chart is the one genuinely new provider cost — `lib/analysis/tickerChart.ts`, its own
`unstable_cache` with a 24-hour revalidate (separate from `fetchPrices`'s existing 5-minute
one), so a ticker page costs at most one Twelve Data request per symbol per day regardless of
how many times it loads — verified empirically: two loads back to back logged one
`fetchPrices` cache miss, not two. `getPostsByTicker`/`getTrendingTickers` (new queries in
`lib/social/queries.ts`) both filter `space_id is null`, matching the app's established
public-only pattern everywhere else.

**Nav/cleanup**: the Leaderboard hidden from `TopNav` and `sitemap.ts` — route files left in
place, per the brief's explicit "remove the entry, leave the route," so a direct URL still
resolves but nothing links to it anymore. Confirmed no `pricing/` route exists on this branch
(the old `/pricing → /give` redirect in `next.config.ts` still covers the historical URL).
`SocialNav`'s Research link gained real active-state highlighting, which it never had before.

## Deviation, deliberate

**The numbers sit above the conversation, not below.** The brief's own explicit instruction
was the opposite — "the conversation sits above the numbers... they are not the point of the
page" — but Eli's direct call, after the phase shipped, was to swap the order. Done and
verified live; documented here as an intentional override, not a missed instruction.

## Real things found while building, and after

- Nothing broke in review that didn't surface again in the "before you call it done" checklist
  itself — the checklist's own item 7 (load a ticker page twice, confirm no second Twelve Data
  request) was what caught the chart-caching design working correctly, not a bug found after
  the fact.

## Known gaps / open items for whoever picks this up

- `components/research/ResearchDesk.tsx` (the retired product's own scorecard UI) is now
  fully unused dead code — nothing imports it anymore, but it was left in place rather than
  deleted unasked, since deleting files wasn't part of this phase's brief.
- 390px was not checked in a real browser, only reasoned through via CSS (the existing
  `repeat(3, minmax(0,1fr))` stat grid already has its own `@media (max-width:620px)` 2-column
  fallback from before this phase).
- Everything still open from `docs/phase-four-recap.md` is **still open** — nothing in this
  phase touched any of it.

## Where to look for more

- `docs/phase-five.md` — the brief this recap summarizes.
- `docs/phase-four-recap.md` — everything before this.
- `docs/state-of-play.md` — current overall status, audited against the live site.
