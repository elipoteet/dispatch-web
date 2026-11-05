# Phase nine, Stage 4 recap: Valuation

Written 1 November 2026. Branch `feat/research-site`. Not on the live site until Eli signs off.

## What a student now sees

A Valuation tab beside Overview and Financials, at `/research/{ticker}/valuation`, with four parts:

- **What's priced in.** One sentence: "To justify today's price, free cash flow has to grow about 16.1% a year for 10 years" (NVIDIA, 1 November). Under it, where that growth takes free cash flow ("from $127.0B over the four quarters to July 2026 to about $564.6B in year 10"). Sliders for the required return (7% to 13%) and the growth after that (1% to 4%), and buttons for 5, 10 or 15 years. The answer changes as they move, in the browser, with no reload. A short "how it works" line says it is arithmetic on today's price, not a forecast.
- **Yields.** Free cash flow yield, earnings yield and buyback yield over the trailing four quarters, with the 10-year Treasury yield beside them for scale.
- **Against its own history.** P/E, EV/sales and free cash flow yield at every quarter-end for ten years. Each one has a small line chart with the median dashed, a bar from low to high with today marked in gold, and a sentence: "Lower than at 97% of quarter-ends since January 2017. Median 50.7× across 39 quarter-ends."
- **Peers.** Up to six companies from Finnhub's peer list, each worked out exactly as the company itself is: market value, the same multiples, and revenue growth. A peer the site hasn't stored yet says "Loading its filings. Refresh in a minute." It is read from the SEC after the page has been sent, and is there on the next visit.

**Banks and insurers** get P/E and price to book instead, with no calculator, no EV/sales and no free cash flow yield. A one-line note explains why.

**When something can't be shown, the page says why** in one line:
- Culp's free cash flow over the past year was negative, so there's nothing to grow from.
- Berkshire's filings give no share count per quarter.
- Twelve Data's allowance is used up for the minute.

The home page's "Valuation" card now links to NVIDIA's.

## Verified

- **The solver** matches a case worked by hand with the closed-form formulas, to four decimal places. At the brief's NVIDIA mockup inputs ($5.77T, $96.7B, 10%, 3%, 10 years) it gives 21.9%. On the live page, today's 16.1% reproduces NVIDIA's $4.93T market value exactly when worked back by hand.
- **Banned words.** "fair value", "target", "undervalued", "overvalued", "buy", "sell" and "hold" were searched as whole words in the rendered pages. There were no matches on any of these:
  - the home page and /research
  - NVIDIA's Overview, Financials and Valuation
  - the Valuation tabs of JPMorgan, Culp, Berkshire and Alphabet

  The site's own disclaimers used to say "no price targets". They now say "no ratings, no verdicts" and "doesn't rate stocks or put a price on them".
- **Twelve Data requests.** A full first click-through of Walmart (Overview, every chart range, Financials, Valuation) cost **4**: Stage 3's three, plus one to find Walmart's 2024 split. A company with no split in ten years costs 3. A second visit costs 0.
- **Real companies, checked against what actually happened:**
  - NVIDIA's market value on both sides of its 2024 split comes out at about $2.16T and $2.77T.
  - Apple's lowest P/E in ten years is 12.4× (late 2018), and Walmart's is about 15× (early 2017).
  - Alphabet's derived Q4 2024 revenue is $96.47B, matching what it reported.
- **Addresses.**
  - `/research/NVDA/valuation` answers 308 to the lowercase address.
  - An unknown ticker gives a 404.
  - SPY, a fund, gives a 404 for Valuation.
  - TSMC, a 20-F filer, gets the foreign-filer note.
- **Each Valuation tab has its own title and description.** None of them mention scoring.
- **Tests:** 224 pass, 60 of them new in this stage, including the twenty-company live check against the SEC. `tsc` and `next build` are clean, and lint adds nothing new.
- **Screenshots** at 1280px and 390px, in light and dark mode. Nothing is wider than the screen; the peer table scrolls inside its own box. The browser reported no errors.

## What deviated from the brief

- **Splits are found from prices, not a split feed.** Twelve Data's and Finnhub's split endpoints are paid. Twelve Data's unadjusted prices are free, and dividing them by the adjusted ones gives the split factor on every date. That costs one request, and is spent only when a company's share counts jump (a split moves them by at least 25%), so most companies never need it.
- **Market value is cross-checked against Finnhub's market value, not its share count.** Finnhub counts Berkshire's shares in Class A terms whichever class is asked about. Against the Class B price, that gave $776 million instead of $1.16 trillion. Dividing Finnhub's market value by the quoted price gives a count in the right units for either class.
- **The history needs a share count for every quarter.**
  - It uses the count on each filing's cover page, and the quarter's diluted count where there isn't one.
  - Companies with several share classes don't file a single cover count. Alphabet's history therefore starts in late 2022, when it began filing one total. Berkshire has no history at all, and the page says so.
  - A guard compares the newest quarter with today's market value. If they disagree by half or more, the history is left out rather than shown wrong.
- **Peers get no split check.** It would cost one request per peer. Their cover counts are checked against Finnhub's instead.
- **Debt is long-term debt as filed.** Many companies state only the part due after the coming year in their quarterly filings, and the total in their annual report. So a quarter's enterprise value can be slightly low, by a few percent at most. The page says so.
- **NVIDIA's free cash flow yield history has 18 quarter-ends, not 39.** NVIDIA didn't tag its quarterly capital spending in a standard way before fiscal 2022.

## What the brief got wrong, or didn't know

- **Quarterly cash flow was wrong since Stage 1.** Companies report quarterly cash flow as running totals (three, six and nine months).
  - The code subtracted one running total from the next, but never subtracted the first quarter. So every second quarter showed six months, and every fourth quarter came out too low, sometimes below zero (Alphabet's buybacks).
  - Yearly figures were always right, which is why no test caught it.
  - This affected the Financials tab's quarterly view on the preview branch, never the live site. It's fixed, and a new test checks the quarters against the six- and nine-month totals the companies actually filed.
  - Trailing-year free cash flow moved as a result: NVIDIA from $149B to $127B, Apple from $161B to $137B. The new figures are the right ones.
- **"One tag per line item per year" lost real quarters.**
  - JPMorgan files its year under one revenue tag and its quarters under another, with the same total. So its quarters for 2023 to 2025 were blank, and Alphabet's first quarter of 2024 likewise.
  - Now a missing quarter can come from a second tag, but only if that tag's full-year total matches to within 0.1%. The twenty-company check verifies that against the filings.
  - Debt now takes each quarter-end from whichever tag has it. Without that, most companies had no EV/sales for three quarters in four.
- **Quarterly share counts were "derived" by subtraction.** That gave NVIDIA about minus 49 billion shares for a fourth quarter. An average share count can't be added or subtracted, so it no longer is.
- **The word check would have tripped on the site's own disclaimers**, as the Stage 2 recap predicted. Reworded rather than exempted.
- **`next dev` doesn't apply the theme colours** (production builds do). Visual checks have to use `next build` and `next start`.

Companies stored before these fixes are re-read once, automatically: `NORMALIZER_VERSION` is now 6.

## Still to confirm

- **On the Vercel preview:** that peers load in the background there as they do locally. Vercel runs `after()` within the page's 60-second limit. This needs `SEC_CONTACT_EMAIL` set for Preview, which is still on Eli's list.
- **Intraday delay** (carried over from Stage 3): measure on a weekday session and label the 1D chart.
