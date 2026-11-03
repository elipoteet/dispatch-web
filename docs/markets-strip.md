# The markets tape

Written 2 November 2026; revised the same evening. Branch `feat/research-site`.

The first version was a still line in the masthead on every page, with each fund linking to its page. Eli asked for it not to be clickable and to look like the old site's tape. He chose the scrolling motion and the old place: on the home page, below the hero. This records the version now on the branch.

## What a visitor sees

- **On the home page only,** right below the hero: a navy band running edge to edge, as the old tape did.
- **It scrolls** SPY, QQQ, DIA, IWM and GLD, then the 10-year Treasury yield, in the old tape's style:
  - IBM Plex Mono at 12px
  - symbols in gold
  - prices with "$"
  - the day's change as a percentage, green for a rise and red for a fall (the 10-year's in percentage points)

  For example: SPY $752.10 −0.48%.
- **"At close"** follows outside 9:30 to 4:00 on weekdays, and all weekend.
- **Nothing in it is a link.**
- **It pauses under the pointer,** and stands still for a visitor who has turned motion off in their device settings.
- **Every other page is as before.** The masthead shows the date again.
- **If no fund quote can be had,** there's no tape.

**Two changes from the old tape's look:**
- **Dark mode:** the band stays dark there too. The old one turned light in dark mode, with gold and green text that couldn't be read on it.
- **No gaps:** the items repeat four times, and the band moves one set's width a minute (about the old speed). So a wide screen never shows an empty stretch at the end of the loop.

## How it works

- **`lib/research/markets.ts` does the work, on the server,** and the home page renders it there (`components/home/MarketsTape.tsx`). The tape is in the page's first HTML, and the browser fetches nothing for it. The motion is CSS only.
- **Quotes come from Finnhub only,** through the existing `fetchQuoteSnapshot`, cached once for everyone (`unstable_cache`), keyed by market time:
  - **While the market is open:** a new key every 5 minutes.
  - **After the close:** one key from the close until the next open. Friday's close to Monday's open is a single key.
  - So the whole site makes at most 5 Finnhub calls per 5 minutes of trading, and 5 per night.
- **The same market hours as the 1D chart.** Its New York clock is now shared (`newYorkClock` in `lib/analysis/chartRanges.ts`), and the chart's own timing is unchanged.
- **A failed or slow quote is left out.** "Slow" means over 2.5 seconds. A failure isn't cached, so the next page load asks again for that fund only.
- **The 10-year comes from the Valuation tab's existing Treasury cache.** That cache now also keeps the day before's yield from the same file, for the day's change, so there's no new request.

## How it was checked

- **Twelve Data:** 10 home visits and 10 company visits made no Twelve Data requests, as before.
- **Finnhub:** from an empty cache, 20 page loads made exactly 5 Finnhub requests, one per fund. Later loads made none.
- **In a browser,** at 1280 and 390 wide, light and dark:
  - a full-width band right below the hero
  - nothing in it a link
  - it moves, and stands still with motion turned off
  - no sideways page scroll
  - no browser request for it
  - no console errors
  - no tape on /research, a company page or About
- **Every text colour on 11 pages** passes in both themes, the gold symbols on navy included. The Stage A sweep of 48 page loads is clean.
- **Layout shift:** the tape causes none of its own; it's in the first HTML, and its motion is a CSS transform, which doesn't count. On a 1280 by 900 screen it's carried up 30px once (0.002; Google calls under 0.1 good). That happens when the hero's headline re-wraps as the web font arrives and replaces the stand-in font, which every page's text does. Self-hosting the fonts with matched fallbacks (`next/font`) would remove this site-wide.
- **Code:** `tsc` is clean and the build is clean. All 381 tests pass, 9 of them for the tape's data: the cache timing, "At close", dropping a failed quote, no tape when every fund fails, and the number formats. Lint adds nothing new.

## Notes

- **Market holidays aren't known,** as with the 1D chart: on one, the cache still turns every 5 minutes during normal hours, and the tape doesn't say "At close".
- **The 10-year is the Treasury's last published day,** usually the previous session; hovering it shows the date.
- **A continuously moving band has no pause button.** WCAG's "Pause, Stop, Hide" rule asks for a way to stop it. Hovering pauses it and the device's reduce-motion setting stops it; a small pause button would meet the rule fully if you want one.
