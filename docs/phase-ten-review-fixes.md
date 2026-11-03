# Phase ten: fixes from the review of stages A to C

Written 2 November 2026, evening. Branch `feat/research-site`. The review checked the preview at `32e462c`; this records what was done about each point.

## Mistakes

1. **Search.** Typing a company's name and pressing Enter now opens that company.
   - "costco" + Enter goes to Costco's file. It used to go to `/research/costco` and "We couldn't find that ticker".
   - The order is: an exact ticker, then the top suggestion, then a typed ticker only when nothing matches.
   - **One exception the brief didn't foresee.** "qqq" finds only QQQX, a different fund whose ticker merely starts with QQQ. Taking the top suggestion there would make QQQ unreachable. So a top suggestion found only through its ticker's first letters doesn't win over what was typed. "qqq" still opens QQQ, and "voo" still opens VOO.
   - **Enter before the suggestions arrive.** If Enter comes before the list has loaded, the box looks the words up first, so it goes where the list was about to point.
   - Code: `chooseSearchTarget` in `lib/research/search.ts`. Tests: costco, apple, an exact ticker over the top result, voo, brk.b, qqq, and words matching nothing.
2. **One market value on every tab.** The Overview and Valuation now use the same calculation (`todayOnFilings` in `lib/research/valuation.ts`): price × the share count on the cover of the latest filing, checked against Finnhub's.
   - Chevron now reads $450.0B and P/E 21.9× on both. It was $444.4B and 21.6 on the Overview.
   - The Valuation tab no longer applies stock-split factors to today's count. They'd have cost the Overview a Twelve Data request. They only matter for a split since the cover's date, and then the count falls outside the check against Finnhub's, so Finnhub's (post-split) count is used, as the page already explains.
   - Test: the Overview's figures equal the Valuation tab's, from NVIDIA's real filings.
3. **Insider names** read given names first.
   - "Wirth Michael K" is now Michael K Wirth, and "Pate R. Hewitt" is R. Hewitt Pate.
   - Suffixes stay last ("Robert George Culp IV"). A surname's particle stays with it ("John Van Horn"). A comma is read correctly ("Huang, Jen-Hsun").
   - Funds, trusts and companies are shown as filed. A Form 4 has no flag for a person, so a name with words like Inc, Trust, Fund or Partners counts as an entity.
   - This is display only; nothing stored changed.
   - Tests: every name in the saved Form 4s, plus the cases above.
4. **Risk-factor headings** no longer run into the next sentence.
   - Chevron's headings sit in the same block as the paragraph under them: a bold run, then plain text, sometimes with a span holding only a space between.
   - From the words alone, a heading can't be told apart from a capitalised word mid-sentence. So the split happens in the HTML, before it becomes text: a line break goes after a block's opening bold run when plain text follows (`breakAfterLeadingBold` in `lib/sec/tenK.ts`).
   - It applies to risk factors only, so the "In its own words" quotes can't change.
   - Across Chevron's 10-K, headings joined to their paragraph dropped from 9 to none. Its comparison now has 46 paragraphs.
   - `COMPARISON_VERSION` is now 3, so every comparison is worked out again on its next visit by a person.
   - Tests: both of Chevron's real blocks, the plain-space case, bold inside a sentence (untouched), and a block that's bold throughout (untouched).
5. **Peers say what's missing.**
   - **What each status says:**
     - No current price.
     - No figures from a 10-K or 10-Q on file yet.
     - No share count.
     - Its filings don't give four quarters of figures yet.
   - ExxonMobil, which has a price, now reads the last of these.
   - **Names: the review guessed the cause the wrong way round.** Finnhub itself writes "Exxonmobil Holdings Corp"; the SEC's ticker list has "ExxonMobil Holdings Corp". So a peer takes the SEC's name when it's in mixed case (the company's own spelling), and Finnhub's when the SEC's is all capitals. With item 8 below it shows as "ExxonMobil".
   - Tests: each missing reason, and the three naming cases.
6. **Chevron's cash and equivalents** are filled for every year: 2019 is $5.69B and 2024 is $6.78B.
   - **There was no standard tag to add.** Chevron's balance sheet tagged those year-ends with an element of its own, which the SEC's summary data leaves out. The only standard tag present (cash including restricted cash) is a different figure, $1.2B higher for 2019.
   - **The fix is the same kind of exact arithmetic as the gross-profit fallback.** That total, less the restricted cash Chevron files for the same date (current and non-current), is the balance sheet's figure. For 2019 it's $6,911M − $452M − $773M = $5,686M.
   - **Checked against every date** where Chevron filed both: it agrees at all 26.
   - **Only where it's safe.** It's used only for a company that files its restricted cash in its own tags, and only on dates where all of them have a value. Apple and NVIDIA hold restricted cash without tagging it separately, so for them the total isn't cash, and they're left alone.
   - It fills only the dates Chevron's own cash tag misses, and it takes priority over the total that includes restricted cash. So Chevron's 2025 now reads $6.29B (its balance sheet) instead of $7.29B. Today's EV/sales on Valuation comes back with it.
   - `NORMALIZER_VERSION` is now 9, so stored companies are read again on their next visit.
   - Tests come from a trimmed copy of Chevron's real SEC data (`lib/sec/__fixtures__/cvx-cash-facts.json`):
     - 2019 and 2024 match the balance sheets
     - the company's own figure is kept where filed
     - 2025 prefers the worked-out figure
     - Apple is untouched

## Polish

7. **Table figures keep one format per row,** set by the row's largest figure: two decimals below 100, one from 100, whole numbers from 1,000.
   - "147 94.69 162" now reads "147.0 94.7 162.0".
   - NVIDIA's revenue row reads "6.9 … 215.9".
   - A test checks every row of four companies' tables, annual and quarterly.
8. **Short display names** ("NVIDIA", "Costco Wholesale", "JPMorgan Chase", "Coca-Cola", "ExxonMobil") on:
   - the home page's cards and Try line
   - Recently viewed, and the search lists
   - the peers table

   The company header keeps the full name. `shortName` in `lib/research/format.ts` takes off Corporation, Corp, Inc., Incorporated, Co, Company, Holdings, Ltd, plc, LLC, L.P., N.V., S.A., AG and a leading or trailing "The". "Procter & Gamble", "AT&T" and "SPDR S&P 500 ETF Trust" are left as they are.
9. **"What's in a file"** descriptions now line up across each row.
10. **One data line per page.** The page-level line under each company and the home page is gone; the dark footer stays. The page line was also where "The Dispatch doesn't rate stocks" sat, so the footer now ends "Not Investment Advice · No Ratings".
11. **The gap above the source notes** on Valuation, Earnings, Insiders and Filings is down from 72px to 24px (20px on a phone).
12. **Key numbers on the Overview.**
    - P/E is written as a multiple ("21.9×"), as on Valuation.
    - Every full-year figure names its year: "Free cash flow FY25", and for consistency "Net margin FY25" and "Gross margin FY25".
13. **The not-found page** keeps the footer at the bottom of the screen.

## Also found and fixed

- **The Filings tab's filter chips were being prefetched** whenever they were on screen, rendering the page once per chip before anyone clicked (no Twelve Data, but wasted work). Prefetch is now off on them, as on the Insiders switch.

## How it was checked

- **Code.**
  - `tsc` is clean and the build is clean.
  - All 372 tests pass, 32 of them new. The live twenty-company check passes with the normaliser change.
  - Lint adds nothing new; the same five older items remain.
- **In a browser on `next start`:**
  - **Search:** "costco" + Enter, typed slowly and sent at once, opens Costco; "apple" opens Apple; "qqq" opens QQQ; "voo" opens VOO.
  - **Chevron:**
    - The same market value and P/E on the Overview and Valuation.
    - "Free cash flow FY25".
    - ExxonMobil labelled correctly and named "ExxonMobil".
    - Michael K Wirth and R. Hewitt Pate.
    - Cash in every year.
    - No table row mixing formats.
  - **Risk factors:** after a visit as an ordinary browser started it, Chevron's comparison was worked out again, with no heading run into its paragraph. My test browser counts as a crawler (its user agent says "headless"), and crawlers rightly don't start that work.
  - **Home page:** short names, aligned descriptions, one data line.
  - **Not-found page:** the footer sits at the bottom of a 900px screen.
- **The phase ten checks, rerun:**
  - Every page at 1280 and 390, light and dark: no sideways scroll, no console errors.
  - Every text colour on 11 pages passes in both themes.
  - The nav checks, every Recently viewed check, and the 48-load Stage A sweep all pass.
  - The redirects, checked with curl: `/portfolio` and `/leaderboard` give one 308 to `/research`, and `/api/portfolio/trade` gives 404.
  - A full NVIDIA click-through makes the same Twelve Data requests as before (the two chart requests).

## Still open

- **Point 14 (optional):** Chevron's "In its own words" quote opens with legal structure. Not done; it's a rule change to how the quote is chosen.
- **The not-found page** could offer the closest name match (the review's suggestion under point 1). Not done.
- **Signed in:** still not checked, for want of a test account.
