# The markets strip

Written 2 November 2026. Branch `feat/research-site`.

## What a visitor sees

- **One still line in the dark masthead on every page, where the date was:** SPY, QQQ, DIA, IWM and GLD, then the 10-year Treasury yield.
  - Each shows its symbol, last price and the day's change with ▲ or ▼, for example "SPY 752.10 ▼ -0.48%" and "10Y 4.91% ▼ -0.03".
  - It's in IBM Plex Mono. Rises are green and falls red, never gold.
- **Each fund links to its research page,** with no prefetch.
- **"At close"** shows at the end outside 9:30 to 4:00 on weekdays, and all weekend.
- **On a phone** the line scrolls sideways inside the bar, and the page itself never scrolls sideways. The masthead's "The Dispatch" name steps aside on a phone while the strip shows; the logo is right below in the nav.
- **If no fund quote can be had,** there's no strip and the masthead shows the date, as before.

## How it works

- **`lib/research/markets.ts` does the work, on the server.** The root layout calls it alongside the sign-in check, so the strip is in the page's first HTML: no flicker, and no request from the browser.
- **Quotes come from Finnhub only,** through the existing `fetchQuoteSnapshot`.
  - Each fund's quote is cached once for everyone (`unstable_cache`), keyed by market time.
  - **While the market is open:** a new key every 5 minutes.
  - **After the close:** one key from the close until the next open (Friday's close to Monday's open is a single key).
  - So the whole site makes at most 5 Finnhub calls per 5 minutes of trading, and 5 per night.
- **The same market hours as the 1D chart.** Its New York clock is now shared (`newYorkClock` in `lib/analysis/chartRanges.ts`), with the chart's own timing unchanged and its tests passing as before.
- **A failed or slow quote is left out.** "Slow" means over 2.5 seconds. A failure isn't cached, so the next page load asks again for that fund only. With no fund at all, there's no strip.
- **The 10-year comes from the Valuation tab's existing Treasury cache.** That cache now also keeps the day before's yield from the same file, for the day's change, so there's no new request. (Its cache key moved to v2, so it refetches once.)
- **The masthead is always dark,** so inside it the rise and fall colours take the dark theme's values of `--green` and `--accent`. In light mode the light theme's dark green and red would be unreadable on navy.

## How it was checked

- **Twelve Data:** a home visit and a company visit made no Twelve Data requests before the change, and none after.
- **Finnhub:** I emptied the strip's cache and loaded 20 pages in 7 seconds. That made exactly 5 Finnhub requests, one per fund. The next 20 made none.
- **In a browser,** at 1280 and 390 wide, light and dark, on the home page and a company page:
  - five funds, the 10-year and "At close"
  - each fund linking to its page, with nothing prefetched even when hovered
  - no browser request for the strip
  - no sideways page scroll, with the strip scrolling in its own box at 390
  - no console errors
  - rises and falls green and red, not gold
- **Every text colour on 11 pages** passes in both themes, including the strip on the navy bar in light mode.
- **Layout shift: nothing jumps.** The strip is in the first HTML and the bar's height never changes. What's left is tiny horizontal movement (0.0003 to 0.0007; Google calls under 0.1 good) as IBM Plex Mono arrives and replaces the stand-in font, which every line of text on the site does. On the company page the name and tabs moved more than the strip. The strip sits at the right, sized to its own items, so the name beside it can't push it. Self-hosting the fonts with matched fallbacks (`next/font`) would remove these shifts site-wide; worth its own change.
- **Code:** `tsc` is clean and the build is clean. All 381 tests pass, 9 new: the cache timing, "At close", dropping a failed quote, no strip when every fund fails, and the number formats. Lint adds nothing new. The Stage A sweep and the nav checks still pass.

## Notes

- **Market holidays aren't known,** as with the 1D chart: on one, the cache still turns every 5 minutes during normal hours, and the strip doesn't say "At close". It costs five Finnhub calls per 5 minutes, and nothing else.
- **The 10-year is always the Treasury's last published day,** usually the previous session; hovering it shows the date.
