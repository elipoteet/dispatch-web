# Phase nine, Stage 5 recap: Earnings

Written 1 November 2026. Branch `feat/research-site`. Not on the live site until Eli signs off.

## What a student now sees

An Earnings tab after Valuation, at `/research/{ticker}/earnings`, with four parts:

- **Next report.** The date and whether it's before the open or after the close, with the quarter it covers ("Q3 FY27" for NVIDIA, "Q4 2026" for a calendar-year company). Under it is the average analyst estimate for EPS and revenue, as Finnhub compiles it.
  - **When the company's latest earnings release states a revenue figure for that quarter,** it is quoted word for word, with a link to the release: "Revenue is expected to be $108.0 billion, plus or minus 2%." The range follows: "$105.8B to $110.2B".
  - **When it doesn't,** one line says so. Many companies give their outlook on the call, as a growth rate, or not at all.
- **Revenue by quarter.** Twelve quarters from the 10-Qs and 10-Ks.
  - Where the company had stated an outlook a quarter earlier, a hatched gold band shows its range on that quarter's bar.
  - The coming quarter's outlook stands as a hatched bar of its own.
  - A small table sets each outlook against what was then reported. For example, NVIDIA's Q2 FY27 outlook was $89.2B to $92.8B and it reported $96.2B.
- **Diluted EPS by quarter.** As filed with the SEC (GAAP), on today's share basis. Fourth quarters are marked ‡ as calculated: the year less the first three quarters.
- **EPS against the average estimate.** The last four quarters from Finnhub, in plain words: "EPS came in $0.08 above the average estimate". Neither table nor text uses "beat" or "miss".

## The open question from the brief: is partial guidance coverage worth shipping?

**Shipped, and recommended.** The rules were tried on the latest earnings release of fifty large companies.

- **Found:** the coming quarter's revenue outlook for 15 of them. The other 35 got nothing, and there were no wrong readings.
  - The 15: NVIDIA, AMD, Amazon, Meta, Broadcom, Intel, Micron, Qualcomm, Texas Instruments, Analog Devices, Cisco, Netflix, Salesforce, Palo Alto Networks and Lululemon.
- **Not found:** Apple, Microsoft, Alphabet, Tesla, the banks, the oil companies and most consumer names. Their releases don't state a dollar figure for next quarter.

So coverage is about a third, concentrated in the companies students look at most. Where an outlook appears, it is the company's own sentence with a link. Where it doesn't, the page says nothing was found rather than guessing.

## Verified

- **Guidance rules:** 22 tests, built from sentences quoted from the real releases, cover:
  - every shape that was found: plus or minus a percentage, plus or minus an amount, ranges written several ways, and tables whose label and figure sit on separate lines;
  - every trap seen: a segment's revenue ("AI semiconductor revenue"), full-year outlooks, results phrased like outlooks ("Cisco reported fourth quarter revenue of $17.3 billion"), changes ("raises guidance by $200M"), and an annual block sitting directly under a quarterly one.

  Run over all fifty releases, the rules matched only the 15 real outlooks.
- **Release to quarter.** Each release's outlook is filed under the quarter after the one it reports. Past outlooks line up with what happened, for example:
  - AMD's Q3 2025: $8.4B to $9.0B against $9.2B reported.
  - NVIDIA's last four quarters, as above.
- **EPS against NVIDIA's own figures:**
  - $0.76, $1.08 and $1.30 for Q1 to Q3 of fiscal 2026.
  - $0.89 for Q4 fiscal 2025.
  - $0.49 for Q4 fiscal 2024, which straddles its 2024 split; see below.
- **Banned words.** Searched as whole words, along with "beat" and "miss", on the Earnings tabs of NVIDIA, AMD, Amazon, Meta, Alphabet, JPMorgan and Culp. There were no matches.
- **Addresses.**
  - `/research/NVDA/earnings` answers 308.
  - SPY and an unknown ticker give a 404.
  - TSMC gets the foreign-filer note.
  - Each Earnings tab has its own title and description.
- **Tests:** 273 pass, including the twenty-company live check. `tsc` and `next build` are clean, and lint adds nothing new.
- **Screenshots** at 1280px and 390px, in light and dark mode. Nothing is wider than the screen; the charts and tables scroll inside their own boxes. The browser reported no errors.
- **Twelve Data:** the Earnings tab costs nothing extra. Its one possible request, to find a company's stock splits, is the same request the Valuation tab makes, shared for a day.
- **SEC:** the first visit to a company's Earnings tab reads its last five releases, two requests each. Each release is then kept for good, because a filed release never changes.

## What deviated from the brief

- **Guidance is found by rules, not AI** (Eli, 31 October). Only a dollar revenue figure for the coming quarter is read. Percentage outlooks (Walmart, Oracle) and full-year outlooks are left alone.
- **The estimates are EPS only.** Finnhub's revenue estimates for past quarters are on the paid plan. Its calendar does give the revenue estimate for the next report, which is shown.
- **Finnhub's reported EPS is on its estimates' basis,** usually adjusted, so it can differ from the GAAP EPS in the chart. The page says so under the table.

## What the brief got wrong, or didn't know

- **Per-share figures break across a stock split.** Each filing states EPS in the shares of its own date. NVIDIA's fiscal 2024 total is $1.19, from a 10-K after its 2024 split. Its first quarter is $0.82, from a 10-Q before it. So "year less three quarters" gave a fourth quarter of **-$0.25**; NVIDIA actually earned $0.49.
  - EPS is now put on today's share basis first, using Stage 4's split detection, and the normaliser no longer derives a fourth-quarter EPS at all.
  - If the split check can't run, the EPS chart says so rather than mixing share sizes.
- **The press release comes before the 10-Q, often by weeks.** On 1 November, JPMorgan had reported its third quarter (13 October), but its newest quarter at the SEC was still the second.
  - The first version named the next report "Q3" when it is Q4, and could have missed an outlook.
  - Quarters are now counted forward from the release, at most two past the filings.
- **The SEC's stated fiscal year end can be one the company hasn't reached yet.** Culp's submissions file says December, but every report it has filed runs to early May. So its quarters were labelled like calendar quarters ("Q1 2025" for one that ended in August 2024).
  - The year end now comes from the company's latest full year of figures. That also fixes the labels on the Financials tab.
- **Years ending within a week of New Year are calendar years.** AMD's ends on the last Saturday of December. Its quarters now read "Q3 2025", not "Q3 FY25".
- **A data-quality note.** For thinly covered small caps, Finnhub's estimates can look wrong: Culp's Q1 FY27 estimate is +$0.45 against a reported -$0.17. It is shown, attributed to Finnhub, not corrected.

Stored companies are re-read once automatically: `NORMALIZER_VERSION` is now 8.

## Still to confirm

- **Peers and releases on the Vercel preview.** Both need `SEC_CONTACT_EMAIL` set for Preview.
- **Intraday delay**, carried over from Stage 3.
