# Phase eleven, Stage C: the screener page

6 November 2026. Branch `feat/screener`, not merged. Nothing here is on the live site yet.

Preview: https://dispatch-m1gc9n9w0-dispatchteam.vercel.app/screener

## In short

- **The screener page is built**, with the main ten filters. It opens on six starting screens with live counts. Any screen can be sorted, paged fifty rows at a time, edited and shared as a link.
- **The database does the filtering and sorting.** The page only ever receives the rows it shows: 50 rows come to about 23 KB.
- **I checked it against my own count of all 4,651 companies.** On eight different screens, the page's count and its first 50 rows matched exactly, in the same order.
- **Two problems in Stage B's numbers turned up.**
  - **Wrong names, now fixed.** Some companies showed the wrong name; Bank of America was "BofA Finance".
  - **Impossible gross margins, partly fixed.** Eight companies showed a gross margin above 100%; those now show n/a. Behind the worst of them is a revenue figure taken from the wrong filing, and that needs one more fix to the nightly job, which I recommend before the screener goes live.
- **Decisions for you**, at the end:
  - **Short-term debt:** still open from Stage B.
  - **Funds:** whether 69 commodity and crypto funds belong in the list.
  - **Revenue from the 10-K:** a fix I recommend before the screener goes live.
  - **Stage D:** whether to go ahead.

## What a visitor now sees

**The opening page, `/screener`.**
- **Top:** "Find companies by what they report", with a line saying it filters about 4,700 U.S.-listed companies and finds companies to read about, not which ones to own.
- **Six numbered starting screens**, each showing its filters in small type and its live count:

  | Screen | Companies |
  |---|---|
  | Revenue up 20% or more, cash flow positive | 287 |
  | Share count shrinking, down 2% or more | 697 |
  | More cash than debt, revenue over $1B | 155 |
  | Gross margin above 70%, revenue over $100M | 282 |
  | Losing money, revenue up 30% or more | 385 |
  | Revenue falling, down 10% or more | 552 |

- **"Or build your own"**, with a button that opens every company with the filters showing.
- **Three short points:** from the filings; facts, not rankings; no price filters yet.
- **The date the figures were last updated.**

**A screen applied** (for example `/screener/revenue-falling`).
- **Heading:** a link back to the starting screens, the screen's name, and "552 companies match. Sorted by revenue, largest first."
- **A toolbar:**
  - each active filter as a chip with an ×, which removes just that filter;
  - **Edit filters**, which opens the filter panel;
  - **Copy link to this screen.**
- **The filter panel:** the nine number filters in three groups, each with a min and a max box, then the sectors as buttons to tick. Below them, one line names the price filters we don't offer and points to each company's Valuation tab.
- **The results table:** company and ticker, sector, revenue, then a column for each active filter, then the month the company's year ended.
  - If a screen has fewer than three filters, it fills with revenue growth, net margin and free cash flow margin, so every row says something.
  - Clicking a column heading sorts by it; clicking again reverses.
  - Each company links to its research file.
- **"Show 50 more"** under the table.
- **A note box:** the fiscal-year basis, that free cash flow is ours, what n/a means, and what's covered.

**On a phone (390 px):**
- Filters and Sort are two buttons side by side at the top.
- Each result is a two-line row: name, ticker and revenue, then the two figures that match the screen.
- Nothing scrolls sideways.

**When nothing matches,** the page names the tightest filter and how many companies meet it on its own: "The tightest is Gross margin: 95% or more. 50 companies meet it on its own." Below that are two buttons: **Remove that filter** and **Clear all filters**.

**Ways in:**
- **Main menu:** "Screener" between Research and About.
- **Home page:** the "Coming" screener card is now a live link.
- **`/research`:** a line under the search: "No company in mind? Find some with the screener."
- **Sitemap:** includes `/screener` and all six starting screens.

## How it behaves

- **The whole screen is in the link.** Each filter, the sort and how many rows are showing are spelled out in the address, so copy-link, the back button and a texted link all bring back the same screen. For example: `/screener?revenue=1b..&growth1y=20..&sector=technology,health-care`
- **Typing is forgiving.**
  - A percent box takes "20" or "20%"; a dollar box takes "1B", "$250M" or "1,000,000".
  - A box that can't be read turns red, says "Not a number, so it's left out", and is ignored.
  - Nonsense in a link is ignored, never an error page.
- **Search engines:**
  - `/screener` and the six starting-screen pages can be indexed, each with its own title and description.
  - Any other combination in the link is marked "don't index", pointing search engines to `/screener`.
  - I checked the page source as both a normal browser and Google's crawler. The tag is in the page head both times.
- **When something goes wrong,** the page still loads normally and says so in a box: "The screener couldn't be loaded just now. Try again in a minute."
  - If the job had never run, the box says the figures are being gathered for the first time.
  - The opening page keeps its six screens even when the counts can't load.
  - I tested both messages on a real production server, using a switch that makes the database reads fail on purpose (`SCREENER_FORCE_FAILURE`, like the site's existing switch for Twelve Data).

## Two fixes to Stage B's numbers, found while building the page

1. **Company names.** The SEC's bulk files label each figure with the name on the filing it came from. That can be a subsidiary's name (Bank of America came through as "BofA Finance LLC") or an old one ("SKK Holdings" for what is now Rantizo).
   - **The fix:** the job now checks each name against the company's own SEC profile.
     - It keeps the bulk-file name only when it's the same name written differently ("A. O. Smith Corporation" against "SMITH A O CORP").
     - Otherwise it uses the profile's current name.
   - **Result:** 55 companies' names changed. I read all 55: each now shows the name the SEC currently has on file for the company, among them Bank of America and Franklin Templeton.
2. **Gross margin above 100%.** Eight companies' filed figures had gross profit larger than revenue, which can't be right.
   - **What it shows now:** we can't tell which of the figures is wrong, so their gross margin is n/a, marked "inconsistent".
   - **Before the fix,** they would have sat at the top of any gross-margin sort.
   - **The worst case, JAKKS Pacific:** its first-quarter 2026 report labelled the first quarter of 2025 ($113.3 million of revenue) as the whole of 2025. The SEC's bulk file keeps a company's most recently filed figure, so it holds that, not the 10-K's $570.7 million.
     - The gross margin rule catches the symptom. JAKKS's revenue, growth and other margins in the screener are still built on the wrong $113.3 million.
     - **24 companies** have revenue taken from a different filing than the rest of their year. Most are probably the same figure repeated in a later filing (Caterpillar is one), but JAKKS shows they can't be trusted blindly.
     - **The proper fix:** take revenue from the 10-K itself whenever the bulk file's figure came from another filing. That's what the job already does for net income, at the cost of about 24 extra small downloads, once. I recommend doing it before the screener goes live; it's job work, not page work, so I haven't done it in this stage.

The job was rerun after both fixes: 69 seconds, 4,651 companies published.

## The checks the brief asks for

1. **Type-check, tests, build:** all clean.
   - 577 tests pass, including the twenty-company check.
   - Lint shows the same four errors and one warning it did before; nothing new.
2. **A real production server, checked with direct requests:**
   - every page answers 200;
   - a made-up screen (`/screener/nope`) answers a real 404, marked "don't index";
   - the sitemap and robots.txt are right.
3. **A fresh, signed-out browser click-through, on this computer and on the preview.** All 20 steps pass:
   - starting screen → sort → reverse → back button → show 50 more;
   - build your own → typing "1B" and "20%" → ticking sectors → the link it makes;
   - copy link → opening that link fresh → removing a chip;
   - the phone sort menu.
4. **390 px wide:** nothing scrolls sideways on any page, in light or dark.
5. **Light and dark:** both checked on every page, at desktop and phone width.
6. **Twelve Data and Finnhub:** zero calls across the whole click-through.
   - The browser contacted only the site itself and Google Fonts (plus Vercel's toolbar on the preview).
   - The local server's log showed no provider calls during it either.
7. **Forbidden words:** none in our wording. The words do appear in company names in the results: Target (TGT) is in the all-companies list, and Best Buy (BBY) is in two starting screens. The brief's check can't pass literally for any page that lists those companies.
8. **This recap.**

## Where I departed from the brief

- **Six starting screens, not nine.** The other three use "More filters" (dividends, ten years of growth, New England), which the brief puts in Stage D.
- **"About 4,700 U.S.-listed companies"**, not "about 5,600 U.S. public companies". The count follows your answer to leave out over-the-counter companies.
  - The list also includes foreign companies that report under U.S. accounting rules, such as Alibaba, JD.com and Sea. So "U.S. filers" would be wrong.
  - The note says what's covered: companies listed on a U.S. exchange that report under U.S. rules, with an annual report from the last 18 months.
- **Each starting screen has its own page** (`/screener/revenue-falling`), which is what lets each one be found in search with its own title. Changing a filter there moves you to `/screener` with the filters in the link.
- **The table adds a "Year ended" column** (for example "Jan 2026"), because each company's latest year ends in a different month.
- **"Show 50 more" stops at 500 rows** and suggests narrowing the screen instead. A thousand-row page weighed 2.5 MB and took nearly three seconds.
- **Filter bounds include the number typed:** "20% or more", "-2% or less". No company has a net margin, free cash flow margin or net cash of exactly zero, so "losing money" and "more cash than debt" pick the same companies either way.
- **Small details the brief left open:**
  - The phone's Sort button is a dropdown menu showing the current sort.
  - The filter panel closes when you press Show results.
  - With only one filter, the no-matches box offers just "Clear all filters", since removing that one filter is the same thing.
- **The note box's wording for net cash says what it really is today:** cash minus debt as tagged, mainly long-term debt, with short-term borrowings usually left out. It changes if you decide to count short-term debt (below).

## What the brief got wrong

- **"The page says 'U.S. filers'."** The list includes foreign companies that file under U.S. rules, as above.
- **Check 7 (forbidden words)** can't pass word for word on a results page, because Target and Best Buy are company names.
- **It assumed the frames' company names could be used as they are.** They can't; see fix 1.

## Rough edges you'll notice

- **Some company names lose their capitals.**
  - The SEC writes many names in capitals ("NVIDIA CORP", "JPMORGAN CHASE & CO"), and nothing in the data says how the company styles itself. They come out as "Nvidia" and "Jpmorgan Chase". The research file's fallback does the same.
  - Names a company already writes in mixed case are kept ("McKESSON" is fixed to "McKesson").
- **Sectors follow the SEC's 1930s-era industry codes**, as Stage A said. MercadoLibre, Sea, DoorDash and Alibaba are filed under "business services" there, so they land in Industrials.
- **13 companies show a preferred-share ticker**, such as "PCG-PA" for Pacific Gas & Electric (PG&E's utility) or "ATH-PA" for Athene. These are companies whose only listed security in the SEC's ticker file is a preferred share. Their figures are the company's own; only the ticker looks unusual. That comes from the Stage B ticker rule.

## Decisions for you

1. **Short-term debt** (from Stage B, still open). Net cash and debt figures use long-term debt; short-term borrowings like commercial paper are mostly left out (Chevron: $10.9 billion). Keep it, as the note box now says, or have me build a total that includes short-term debt?
2. **Funds in the list.** 69 commodity and crypto funds file annual reports with the SEC, so the job took them in:
   - examples: SPDR Gold (GLD), iShares Bitcoin (IBIT), United States Oil (USO);
   - they sit under Financials, and 55 of them have no revenue, so they sink to the bottom and drop out of every revenue filter.
   - **My suggestion:** leave them out. The page is about businesses, and the count becomes about 4,600. It's a one-line rule in the job.
3. **Revenue from the 10-K** (fix 2 above). I'd like to add it, either before Stage D or as part of it.
4. **Stage D:** the seventeen "More filters", the multi-select state filter, and the three remaining starting screens. Say go when you're ready.

Nothing is merged, and I won't merge or open a pull request without your sign-off.
