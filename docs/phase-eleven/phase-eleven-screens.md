# Phase Eleven addendum: screens investors actually use, and a page a student can use

Written 7 November 2026, after Stage C. Save this as `docs/phase-eleven/phase-eleven-screens.md`. It replaces the brief's starting screens and adds to Stage D. The five fixes Eli sent after Stage C (net cash, gross margin, revenue from the 10-K, funds out, names) come first, because every screen below depends on them.

## Why

Eli wants the screener to be something a serious investor would actually use, and easy for a student who has never used one. The first six screens were neutral, but several weren't questions an investor asks ("Revenue falling", "Gross margin above 70%"). The new set is built around the questions fundamental investors really screen for: is this a strong business, is it growing in a way that pays, where does the cash go, could it survive a bad year, and can the numbers be trusted.

The no-verdict rule still holds. A screen title describes what its filters find, never that the result is good, cheap or worth buying. Each screen gets one plain line saying why investors look at that, written as a fact about the measure, never as advice.

## Three new measures

Add these to the nightly job and the filter list. Write unit tests for each, including every n/a case, and spot-check five companies against their 10-Ks.

1. Return on invested capital (ROIC). After-tax operating income divided by invested capital. After-tax operating income is operating income times (1 minus the effective tax rate), where the effective rate is income tax expense over pretax income, held between 0% and 35%. If the rate can't be worked out (a loss, or no tax line), use 21% and say so in the definition. Invested capital is total debt plus total equity minus cash and short-term investments, at year end. n/a for banks, insurers and REITs, and when invested capital is zero or below. This needs income tax expense and pretax income tags, added the same careful way as the Stage A line items. ROIC goes in the main ten, because it's the first number quality investors look for.
2. Operating margin change over 3 years, in percentage points: this year's operating margin minus the margin three fiscal years earlier. n/a if either year is n/a.
3. Growth plus free cash flow margin ("Rule of 40"): 1-year revenue growth plus free cash flow margin. n/a if either is n/a.

Also add cash conversion: operating cash flow divided by net income, n/a when net income is zero or below. It goes under More filters.

## The starting screens

Replace the six current ones. They're grouped under the question each answers, in this order. The thresholds are starting points: tune each one to a round number so the screen returns roughly 15 to 150 companies, and report every final threshold and count. Each screen sorts by its own key measure, shown first after the company, not by revenue.

Quality: Is this a strong business?
- High return on capital. ROIC ≥ 20%, revenue ≥ $500M. Sort by ROIC, highest first. Why: "Earns a lot on the money tied up in it, so it can grow without needing much more. Many long-term investors start here."
- Revenue up ten years in a row. Years of revenue growth ≥ 10. Sort by 10-year revenue growth. Why: "Sales grew every year for a decade, through 2020 and everything since."
- Strong free cash flow. FCF margin ≥ 25%, revenue ≥ $1B. Sort by FCF margin. Why: "Keeps a large share of every sale as cash after running and reinvesting in the business."

Growth: Is it getting bigger, and does it pay off?
- Fast growth, already profitable. Revenue growth 1 yr ≥ 20%, operating margin ≥ 10%, revenue ≥ $200M. Sort by growth. Why: "Growing quickly without losing money to do it."
- Rule of 40. Growth plus FCF margin ≥ 40%, technology sector, revenue ≥ $200M. Sort by that sum. Why: "A common yardstick for software: growth plus free cash flow margin adds up to 40% or more."
- Margins widening. Operating margin up ≥ 5 points over 3 years, revenue ≥ $200M. Sort by the change. Why: "Each new dollar of sales is earning more than it did three years ago."
- Fast growth, still losing money. Revenue growth 1 yr ≥ 30%, net income < 0, revenue ≥ $100M. Sort by growth. Why: "Earlier-stage companies. The question is when, or whether, profit follows."

Shareholder returns: Where does the cash go?
- Buying back shares. Share count change 1 yr ≤ −3%, free cash flow > 0. Sort by share count change, most negative first. Why: "Fewer shares means each remaining one owns more of the company." Check it against the stock-split cases, so a split never shows up as a buyback.
- Dividends covered by cash flow. Pays a dividend, dividends ≤ 60% of free cash flow, revenue ≥ $500M. Sort by dividends as a share of FCF, lowest first. Why: "Pays its dividend out of free cash flow with room to spare if a year goes badly."

Balance sheet: Could it ride out a bad year?
- More cash than debt. Net cash > 0 (on the corrected definition), free cash flow > 0, revenue ≥ $1B. Sort by net cash. Why: "Holds more cash and short-term investments than it owes."

Read closely: Things investors check before trusting the numbers.
- Profits without the cash. Net income > 0, cash conversion < 0.5, revenue ≥ $200M. Sort by cash conversion, lowest first. Why: "Reported profit isn't turning into cash. Sometimes it's timing, sometimes accounting. Worth knowing which."
- Issuing shares fast. Share count change 1 yr ≥ 10%, revenue ≥ $100M. Sort by share count change, highest first. Why: "New shares split ownership more ways. Investors check what the money paid for."

Close to home
- Based in New England. Headquarters in MA, NH, ME, VT, RI or CT. Sort by revenue.

Each screen keeps its own indexable page, as in Stage C, with a title and description built from its name and why line. The old screen addresses that no longer exist redirect to `/screener`.

## Making it easy to use

The test: a finance student who has never used a screener opens the page, understands what each screen finds, and can change a filter without help.

1. Every filter shows a one-line, plain-English definition under its name in the filter panel. The mockup has wording for the main ten; write the rest in the same voice.
2. Every filter also shows where the middle company sits: "Half of companies: above 38%". Work it out from all companies in each nightly run and store it with the run. This is the most useful thing a beginner can see, because it tells them whether 20% is high or ordinary.
3. Starting-screen cards show the title, the why line, the filters in plain words, and the live count.
4. Build your own starts with one removable chip already applied, "Revenue at least $100M", with a quiet note that very small companies are hidden until it's removed. Thousands of tiny companies otherwise crowd out the results.
5. Columns follow the screen. The screen's own measure comes first after the company, then the other active filters, then revenue. A column header is the plain name, never an abbreviation a student wouldn't know. If space forces one, the table has a "What these columns mean" note underneath.
6. Each result row links to the company's research file and has a second small link, "What the price assumes", to that company's Valuation tab. This bridges the screener's limit: the screener finds the business, and the Valuation tab shows what today's price expects of it.
7. Inputs forgive: "20", "20%", "500M", "1.5B" and "$2B" all work. A value that makes no sense is ignored, with a short note next to the box, not an error page.
8. On the results page, under the title, one plain sentence restates the screen in words: "Companies with a return on invested capital of 20% or more and revenue of at least $500 million."

## Not changing

No scores, rankings or "best" anywhere, and no price filters. Sorting is the visitor's choice. Everything in the brief's "Before calling any stage done" list still applies, including the forbidden-words check on our own copy (company names excepted).

## Report back

Final thresholds and counts for every screen. The first ten companies of each, so Eli can sanity-check that the lists look like what the titles promise. The ROIC spot-checks. The median for every filter.
