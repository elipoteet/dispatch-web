# Phase nine, Stage 3 recap: the price chart

Written 1 November 2026. Branch `feat/research-site`. Not on the live site until Eli signs off.

## What a student now sees

The Overview's price chart has all eight ranges, and clicking one redraws the chart in place:

| Range | What's drawn |
|---|---|
| 1D | The latest session in 5-minute steps, from 9:30 AM to 4:00 PM ET, with a dotted line at the previous close |
| 1W | The last five sessions in 30-minute steps |
| 1M, 3M, 1Y | Daily closes |
| 5Y, 10Y | Weekly closes |
| MAX | Monthly closes back to the listing (NVIDIA from January 1999, Coca-Cola from 1970) |

- **The caption above the chart states the move.** For example "-4.22% on the day" (the same figure as the page header), "+0.9% over 1Y" or "121x over 10Y". If a company's history is shorter than the range, it says "since" the first date instead.
- **Gold dots mark earnings releases** on 3M, 1Y and 5Y. Hovering over one gives its date. The legend under the chart counts them and gives the next earnings date ("Nov 17, 2026, after the close").
- **Labels:** the chart is labelled with the line's own high and low, at their actual heights.
- **When Twelve Data's allowance is used up,** 1D, 1W and MAX say "Updating, try again in a minute." The daily ranges switch to Tiingo, and the rest of the page is unaffected.

## Verified

- **First visit, fresh browser:** clicking all eight ranges on NVIDIA cost **3 Twelve Data requests**: the 20-year daily history, one 5-minute request shared by 1D and 1W, and one monthly request for MAX. The browser made two requests to the server in total.
- **A second fresh browser** doing the same cost **0**.
- **Allowance forced to "used up"** (`TWELVE_DATA_FORCE_BUSY=1`, on Apple, nothing cached):
  - 1D, 1W and MAX show the "Updating" message.
  - 1M to 10Y draw from Tiingo, with Apple's 2020 split correctly smoothed out.
  - The stats, facts, 52-week bar and Paper trade button all render.
- **Tests:** 164 pass, and 26 of them are new. They cover the range maths, the market-hours cache timing (including the 1 November daylight-saving change), the earnings markers, the Twelve Data gate against a pretend Twelve Data (seven requests a minute, a 429, a forced busy) and the split repair on NVIDIA's real 2024 split.
- **Checks and screenshots:** `tsc` and `next build` are clean, and lint adds nothing new. Screenshotted at 1280px and 390px, in light and dark.

## What deviated from the brief

- **Fewer requests than budgeted.** The brief's table allowed one daily request plus a separate one for 10Y and MAX. One daily request at Twelve Data's maximum (5,000 days, about twenty years) now covers 10Y too, and MAX is a small monthly request made only when clicked.
- **1D and 1W share one request.** The brief had 1D on 5-minute bars and 1W on hourly bars, as separate requests. Now one 5-minute request covers five sessions, and 1W is thinned to 30-minute steps. It refreshes every five minutes while the market is open and at most twice a day when it's closed.
- **Earnings dates come from the SEC, not Finnhub.** Finnhub's free calendar has no past dates (asked for NVIDIA 2016–2026, it returned none). Past releases are the company's 8-K filings under Item 2.02, which the page already downloads. Only the next date comes from Finnhub.
- **No markers on 10Y and MAX.** Forty or more dots crowd the line. The SEC's recent-filings list also reaches back only so far: NVIDIA to 2020, Apple to 2015, and JPMorgan only to late 2025, because it files tens of thousands of bond documents a year. Markers are drawn only when the dates cover the whole range, so a chart never shows dots on its recent half and implies there were no earnings before.

## What the brief got wrong, or didn't know

- **The Tiingo fallback drew fake crashes at stock splits.** Twelve Data adjusts old prices for splits; Tiingo doesn't, and a code comment claimed they matched. Fixed and tested on NVIDIA's real 2024 split. This also affected the alerts job whenever it fell back to Tiingo.
- **The 1D change disagreed with the header.** The last 5-minute bar isn't the official closing price: -4.14% against -4.22% for NVIDIA on 30 October. The chart now uses the official figures when they belong to the session shown.
- **A cache trap.** A cached function's key doesn't change when a helper it calls changes, so new fields could have been hidden behind old cached copies for hours. Recorded in the project context as gotcha 9.

## Still to confirm

- **Intraday delay.** The brief asks for the 1D chart to state how delayed the free plan's intraday prices are. That can only be measured while the market is open, and this was built on a weekend. Until then, the chart says exactly what time its data runs through. Check on the first weekday session, then label it (for example "Delayed 15 min").
- **Market holidays.** The cache timing doesn't know about market holidays. On one, a watched chart re-asks Twelve Data every five minutes during normal hours. That costs a little allowance and nothing else.
