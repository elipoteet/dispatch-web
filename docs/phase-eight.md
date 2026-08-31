# Phase Eight — Most Traded rail

Branch `feat/social-v1`. Read `docs/state-of-play.md`, `docs/claude-project-context.md` and
`docs/phase-five.md` first. The published design page is the visual spec.

Eli's ask: a trending-tickers box in the right sidebar, ranked by the day's trading volume,
like Yahoo Finance's Most Active.

---

## A. The data problem, and the answer

There is no market-wide "most active" list on either provider the site currently uses.
Finnhub has no volume screener on the free tier, and Twelve Data's market-movers endpoint is
a paid plan. Ranking by volume means knowing every ticker's volume, which is thousands of
requests against an 8-per-minute ceiling. It cannot be done with what is wired up today.

**Use Polygon's Daily Market Summary** (`/v2/aggs/grouped/locale/us/market/stocks/{date}`,
now served under the Massive brand). It returns **every US ticker for one session in a single
request**, with open, close, volume and VWAP. It is available on the free Stocks Basic tier.

This is a very good fit, and it is worth being explicit about why:

- **One request per day fills the entire panel.** Symbol, price, session move and volume all
  come back in the same response. No per-ticker calls, and the panel adds **zero** load to the
  Twelve Data budget that constrains everything else on this site.
- Wrap it in `unstable_cache` keyed on the session date, revalidating daily. A plain in-memory
  Map does not survive between serverless invocations — established gotcha.
- New environment variable, `POLYGON_API_KEY`. Add it locally and in Vercel production.

**The free tier is end-of-day, not intraday.** Yahoo's box is live; this one shows the last
completed session. That is fine, but it must be labelled — the panel header carries the
session date ("Fri 28 Aug close") so it is never quietly wrong over a weekend. Do not write
"today" anywhere in this component.

## B. Ranking — read this before writing the sort

**Rank by dollar volume (close x volume), not share volume.**

Raw share volume on US markets is dominated by sub-$1 penny stocks and leveraged ETFs. A
literal "top 6 by volume" panel on a college finance site would mostly show shell companies
and 3x products, and every row would link to a research page with no fundamentals behind it.
Dollar volume surfaces the names a finance club actually discusses, without inventing an
arbitrary filter.

On top of that:

- **Exclude ETFs and leveraged products.** Not taste — `getTickerSnapshot` is built on Finnhub
  `profile2` and `metrics`, which return almost nothing for SPY or QQQ. An ETF row would link
  to a ticker page that looks broken. A small maintained deny-list is fine; note in the recap
  that it is a deny-list and will need occasional attention.
- Apply a price floor (around $5) as a second guard.
- Take **6 rows.** The rail is 260px; more than that becomes a wall of digits.

## C. The panel

Per row, linking to `/research/[TICKER]`:

- Symbol, mono, semibold
- Company name beneath it, dim, truncated with ellipsis
- Close price and session move (`(close - open) / open`), right-aligned, tabular numerals,
  green up / red down using the existing tokens
- Dollar volume traded, e.g. `$41.2B traded`
- **Post count, when greater than zero** — a small gold chip reading "3 posts"

That last item is the only part of this panel Yahoo does not have, and it is the reason the
panel belongs on The Dispatch rather than being a generic widget. It says what the market is
trading *and* what this campus has said about it. One grouped database query over the six
symbols; cheap. **When a ticker has no posts, render nothing** — no zero, no empty chip. A
row that says "0 posts" advertises that the site is empty; a row with no chip just looks calm.

Header: "Most traded" plus the session date. Footer: a single link to `/research`.

Clicking a ticker nobody has posted about lands on that ticker's page with "Nobody has posted
about $X yet. Be first." That is the correct outcome, not a gap — it is the shortest path from
idle scrolling to writing something.

## D. The layout change, which is the risky part

The social shell is currently a **two-column** grid — `200px | minmax(0,1fr)`, max-width 920px
(`.social-shell` in `app/globals.css`). This adds a third column and affects **every page in
the app**, not just the feed.

- Grid becomes roughly `200px | minmax(0,1fr) | 260px`; max-width goes to about 1220px.
- **The rail needs its own breakpoint, above the nav's.** It should disappear before the left
  nav does — navigation matters more than a data panel. Suggested: rail hides below 1100px,
  nav keeps its existing 900px behaviour.
- Decide deliberately which pages show the rail. The feed and post pages, clearly. Signup,
  login, onboarding and the sign-in screen, clearly not. `/research/[ticker]` is a judgement
  call — a most-traded panel beside a ticker page is either useful or redundant; pick one and
  say which in the recap.
- Sticky positioning: `.social-main` currently sets `z-index: auto` to undo a global
  `main { position: relative; z-index: 2 }` rule that caused a real stacking bug with the
  sign-in overlay. If the rail is made sticky, check it against that overlay and the promote
  modal before assuming it is fine.
- Widening the shell changes the feed's line length on large screens. Look at it before and
  after; if the feed column gets uncomfortably wide, cap the content column rather than
  shrinking the rail.

## E. Things that will bite

- **Weekends and holidays.** There is no session. Fall back to the most recent trading day and
  say which one — that is what the dated header is for. Do not show an empty panel on a
  Saturday.
- **The date to request.** Asking Polygon for today's date before the close returns nothing.
  Resolve the last completed session first, and handle the pre-open window on a weekday.
- **Failure is silent-ish.** If the call fails, render the panel with the "couldn't load"
  message shown in the design rather than throwing — `error.tsx` boundaries are unreliable in
  this Next version and this is a sidebar, not the page.
- **Do not count generated posts** in the post-count chip, for the same reason phase seven
  excludes them from ticker counts.
- The panel must not turn into a ranking of people or posts. It ranks *the market's* volume,
  which is arithmetic from an exchange, not a Dispatch judgement about anybody.

## Before you call it done

1. `npx tsc --noEmit` and `npm run build` clean; no new lint errors.
2. Real `next start`, then `curl`.
3. Confirm the whole panel costs **one** Polygon request per day, and **zero** Twelve Data
   requests. Load a page twice and check no second call goes out.
4. Confirm no ETF or sub-$5 stock appears in the six rows.
5. Click every row and confirm each lands on a working ticker page.
6. Confirm the post-count chip matches reality, and is absent rather than zero.
7. Load it on a Saturday (or fake the date) and confirm the header names the correct session.
8. Kill the API key and confirm the panel degrades to the message instead of breaking the page.
9. Check every page type at 1440px, 1100px, 900px and 390px — the rail should vanish before
   the nav does, and the feed should still read well at the new max width.

Report in plain language: what the panel shows, which pages it appears on, and anything here
that turned out wrong.
