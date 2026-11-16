# Phase eleven: the filter panel, redesigned (16 November 2026)

Branch `feat/filter-panel` (1d651f2), first previewed at https://dispatch-afsm7yior-dispatchteam.vercel.app, not merged. **Since merged into `feat/screener-home` (ff51ab5) on Eli's word, so one preview carries the panel and the compact opening page together: after the audit fixes (bdf800d), https://dispatch-kpnnfhhc7-dispatchteam.vercel.app.** Brief: Eli's message of 16 November with the mockup, plus two additions at the plan stage (a change count on the submit button; a hint under an empty new row).

## What changed on the page

The panel under "Edit filters" used to list all 29 range filters with their full definitions, the 12 sector chips and the 57-box headquarters grid. It now shows:

1. **Your filters · N**, one compact row per filter in use: name, a **?** button, the min and max boxes, the unit, the median ("Half above 9.1%"), and a **×** that removes the row. On a starting screen's page the rows are that screen's filters; "Build your own" starts with the single Revenue ≥ $100M row; "Clear all" leaves no rows and opens the picker.
2. The **?** opens the full definition and the full median line ("Half of companies: above 9.1%") under that row. `aria-expanded` and `aria-controls` are set, one definition is open at a time, and Escape closes it and returns focus to the ?.
3. **+ Add a filter** opens the picker: a search box that matches the name and the short description ("debt" finds Net cash or debt, Debt to equity, Current ratio and the repayment-years filter), the nine groups as buttons with a count each, and the filters in the chosen group, name over short description. Choosing one adds its row and puts the cursor in its min box. A filter already in use shows a check and can't be added again. Sector and Headquarters sit in the picker under "Sector and headquarters"; Pays a dividend under "Shareholder returns".
4. The submit button reads **Show results** until something changes, then **Show results · N changes** in solid navy, where N counts rows added, removed, or with a box or choice edited. A removed row is gone, not greyed.
5. A new row with both boxes empty says **Enter a min, a max, or both.** An empty row is left out of the link on Show results, as before.
6. Nothing about filtering, the link, counts or sorting changed. The link is still built by the same `viewQuery`; the form still submits without JavaScript (the rows it opened with).

## The short descriptions (lib/screener/filters.ts, `short`, beside each definition)

| Filter | Short description |
|---|---|
| Revenue | Total sales in the latest year |
| Revenue growth, 1 year | How fast sales grew last year |
| Revenue growth, 3-year average | Yearly sales growth, averaged over three years |
| Gross margin | Sales minus the direct cost of goods |
| Operating margin | Profit from running the business, per sale |
| Net margin | Bottom-line profit per dollar of sales |
| Free cash flow margin | Cash kept from each sale after investing |
| Return on invested capital | Profit earned on the money tied up |
| Net cash or debt | Cash and investments, less all debt |
| Share count change, 1 year | Buybacks or new shares over the year |
| Return on equity | Profit as a share of shareholders' money |
| Return on assets | Profit as a share of everything owned |
| Net income growth, 1 year | How fast net income grew last year |
| Earnings per share growth, 1 year | Growth in profit per share last year |
| Operating margin change, 3 years | Whether margins are widening |
| Revenue growth plus free cash flow margin | The software industry's "Rule of 40" |
| Cash conversion | Cash brought in per dollar of profit |
| Research and development, share of revenue | Research spending as a share of sales |
| Capital spending, share of revenue | Spending on equipment, as a share of sales |
| Sales and admin costs, share of revenue | Selling and admin costs per dollar of sales |
| Dividends, share of free cash flow | How much free cash goes to dividends |
| Buybacks, share of free cash flow | How much free cash goes to buybacks |
| Debt to equity | Debt for each dollar of shareholders' money |
| Current ratio | Short-term assets over short-term debts |
| Years of free cash flow to repay net debt | Years of cash flow to clear the debt |
| Interest coverage | How many times profit covers interest |
| Revenue growth, 5-year average | Yearly sales growth, averaged over five years |
| Revenue growth, 10-year average | Yearly sales growth, averaged over ten years |
| Years in a row of revenue growth | Straight years of rising sales, up to ten |
| Pays a dividend | Paid any dividend in the latest year |
| Sector | Technology, health care, energy and so on |
| Headquarters | The state the company is based in |

A test holds each to eight words or fewer, no trailing period, no abbreviation a student wouldn't know.

## Page height, filters open

Measured with a headless browser (`document.documentElement.scrollHeight`), the panel opened with the Edit filters button. Before: the live site on master. After: the same build as the preview, served locally, and the preview itself.

The Compounder, /screener/the-compounder:

| Width | Before: page | Before: panel | After: page | After: panel |
|---|---|---|---|---|
| 1280 px | 7,967 px | 4,133 px | 4,419 px | 584 px |
| 390 px | 12,026 px | 6,331 px | 6,742 px | 1,047 px |

Build your own, /screener?revenue=100m..&edit=1:

| Width | Before: panel | After: panel |
|---|---|---|
| 1280 px | 1,735 px | 340 px |
| 390 px | 2,688 px | 499 px |

On The Compounder at desktop the results table now starts 1,379 px down the page with the panel open, against 4,927 px before.

## Checks

- `npx tsc --noEmit` clean; `npm test` 676 passed, 2 skipped; lint at the baseline (4 errors + 1 warning, all pre-existing); `npm run build` clean; a real `next start -p 3100` (port 3000 was not in use).
- Fresh browser context on the local production build, then on the preview:
  - /screener?edit=1: "No filters yet. Add one below.", picker open, nine groups with counts 3, 5, 2, 7, 3, 3, 4, 3, 2.
  - /screener?revenue=100m..&edit=1: one row, "Your filters · 1".
  - The Compounder: five rows in link order; ? opens the definition, a second ? closes the first, Escape closes; untouched submit reads "Show results".
  - Search "debt" lists four filters with their groups, the repayment-years one checked as already in use; adding Debt to equity gives six rows, the hint "Enter a min, a max, or both.", focus in its min box, "Show results · 1 change"; typing 1 keeps it at one change (same row); removing Revenue growth with × gives "2 changes"; Show results lands on `/screener?revenue=500m..&fcf=15..&roic=20..&de=1..&ndfcf=..2&sort=roic` with the matching chips, 11 companies.
  - Sector (Technology), Headquarters (All of New England) and Pays a dividend added through the picker: "3 changes", link `?revenue=100m..&sector=technology&state=ct,me,ma,nh,ri,vt&dividend=yes`, chips Revenue, Pays a dividend, Sector: Technology, Headquarters: New England.
  - All 14 starting screens: opened, panel opened, Show results clicked untouched; the chips before and after are identical on every one, and the button read "Show results" (no changes) on every one.
  - Keyboard: from a ? the Tab order is min box, max box, remove ×, next row's ?.
  - 390 px, light and dark: `scrollWidth` 390, panel 358 px wide, no sideways scroll; desktop dark the same. Panel, inputs and picker take the theme's colours.
  - No page errors in the console.
- A unit test rebuilds every starting screen and four sample links (negative ranges, two-ended ranges, sector + state + dividend, ratios, counts, years) from the panel's rows through `filtersFromPanel` and gets the identical link back; another checks an empty row drops out and nonsense sectors are ignored.

## About page

Read `app/about/page.tsx` against the site after the change. The screener paragraph describes what the screener does (filters by the figures in filings, starting screens, The Compounder, no price filters) and names no panel mechanics; no feature was added, removed or renamed, so the page needs no change and none was made.

## Judgment calls, for Eli to overrule

- Values still apply on **Show results**, as before. Adding a filter puts an empty row in the panel; the link changes when the form is applied. A row with no bounds can't be written in a link, and applying on every keystroke would navigate on every keystroke. The toolbar chips still remove and navigate at once.
- The row shows the short median ("Half above 9.1%"); the full "Half of companies: …" line is behind the ?.
- Sector and Headquarters have their own picker group, "Sector and headquarters", rather than being folded into a measure group.
- Without JavaScript the panel is a plain form of the rows it opened with (values editable, Show results works); adding a filter needs the script.

## Left open

- Nothing in the code. Merge on Eli's go; no migration, no cron change, no About change.

## Eli's audit of the combined preview (16 November 2026), fixed

1. **The class collision.** The panel's "?" button and the opening page's group heading both used `.rf-scr-q`, so every heading rendered as a 24px bordered box. The button is now `.rf-scr-qbtn`. A new test, `lib/screener/stylesheet.test.ts`, reads `app/research-file.css` and fails if any screener class has two top-level rules; run against the stylesheet as it was, it reports `.rf-scr-q` at lines 743 and 804. The browser check (`homecheck.mjs`) and the screenshot script also fail if a group heading is narrower than its column.
2. **The eight panel fixes.**
   a. "Clear all" sits on the "Your filters · N" line, right-aligned and centred, inside the panel.
   b. Every row is one grid: name and ?, min, "to", max, unit, median, ×, in fixed columns, so boxes and medians line up down the panel.
   c. The unit follows the max box for every filter ($, %, yrs, ×, pts); nothing inside the boxes. Empty boxes read "Min" and "Max". The boxes still take "500M", "1.5B" and "$2B".
   d. The ? is centred in a 24px box on the label line.
   e. Medians carry no plus sign ("Half above 4.0%"); a minus stays ("Half above -1.2%"). The full line behind the ? follows the same rule.
   f. Six picker groups, as set: Size and growth (8: revenue, the four revenue growth measures, years in a row, net income and earnings per share growth); Margins and returns (10: the four margins, return on invested capital, equity and assets, margin change, growth plus free cash flow margin, cash conversion); Spending (3); Balance sheet (5: net cash, years to repay net debt, debt to equity, current ratio, interest coverage); Shareholder returns (4: share count change, pays a dividend, dividends and buybacks as a share of free cash flow); Sector and headquarters (2). The link's fixed order is unchanged: only each filter's `group` moved, not its place in `RANGE_FILTERS`. The tests name every group's members.
   g. The picker list fills the box: `auto-fill, minmax(260px, 1fr)`, equal row heights.
   h. "Done adding" is a quiet text button in the picker's top-right corner; "+ Add a filter" is quiet too. "Show results" is the only button that goes solid, and only once something has changed.
3. **Smaller.** The results column head reads "Years to repay net debt" (`heading` on that one filter; the panel keeps the full name). "Open the filters" on the opening page is the outlined button, so The Compounder's row stands alone.

Checks after: tsc clean, 680 tests (two new files' worth), lint at baseline, build clean, the panel walk-through and all 14 starting screens reproduced, the opening-page check with the heading assertion. Screenshots in `docs/phase-eleven/screenshots/`: `screener-{1280,390}-{light,dark}.png` (whole page) and `the-compounder-filters-{1280,390}-{light,dark}.png` (panel open, picker open, one definition open).
