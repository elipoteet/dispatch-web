# Phase eleven: the opening page, compact (16 November 2026)

Branch `feat/screener-home` from master (24bc5da), not merged. **Combined with the filter panel redesign on Eli's word (16 November): `feat/filter-panel` is merged into this branch (ff51ab5), so one preview carries both: https://dispatch-7grhdsouf-dispatchteam.vercel.app.** The opening page alone was first previewed at https://dispatch-r36kxc6c2-dispatchteam.vercel.app. Brief: Eli's message of 16 November with the "Opening page, compact" mockup.

## What changed on /screener

1. **Each starting screen is one row, not a card**: title, a one-line description under it, the live count and an arrow on the right. The whole row is one link. Hover tints the row and turns the title gold. Thin rules between rows, no boxes.
2. **Two columns at desktop width**: left Quality and Growth; right Shareholder returns, Balance sheet, Read closely, Close to home. Each group's kicker and question sit on one line over a rule. The columns stack below 1,000 px.
3. **The filter lists are off the opening page.** Each screen's own page still shows them as chips, with the longer why-line under the title, as before.
4. **No 01–14 numbers.**
5. **The Compounder** stays on top, full width, one slim row with a gold border: kicker, title, description, count, arrow.
6. **One-line descriptions**, Eli's wording, stored as `description` in `lib/screener/screens.ts` beside each screen's `why`:

| Screen | Description |
|---|---|
| The Compounder | High returns on capital, steady growth, strong cash flow and little debt. |
| High return on capital | Earns a lot on the money tied up in it. |
| Revenue up ten years in a row | Sales grew every year for a decade. |
| Strong free cash flow | Keeps a large share of every sale as cash. |
| Fast growth, already profitable | Growing quickly without losing money to do it. |
| Rule of 40 | Growth plus free cash flow margin of 40% or more. |
| Margins widening | Each dollar of sales earns more than three years ago. |
| Fast growth, still losing money | Earlier-stage companies, not yet profitable. |
| Buying back shares | Fewer shares, so each one owns more. |
| Dividends covered by cash flow | Pays its dividend with room to spare. |
| More cash than debt | Holds more cash than it owes. |
| Profits without the cash | Reported profit isn't turning into cash. |
| Issuing shares fast | New shares split ownership more ways. |
| Based in New England | Headquartered in the six New England states. |

7. Nothing about the screens, their links, counts or pages changed: `screens.ts` gained one field per screen and nothing else; the pages, slugs, filters, sorts and the nightly counts are untouched. The page's intro, "Or build your own" and "Three things to know" are as they were. A line under the rows says the numbers are companies matching each screen tonight.

## Page height, /screener

`document.documentElement.scrollHeight`, headless browser. Before: the live site on master. After: the same build as the preview, served locally, and the preview.

| Width | Before | After | "Or build your own" starts |
|---|---|---|---|
| 1280 px | 3,761 px | 1,879 px | 3,095 px → 1,212 px |
| 390 px | 5,671 px | 3,332 px | 4,543 px → 2,205 px |

At 1280 × 900 the Compounder row and both columns are on screen together after the intro, as in the mockup.

## Checks

- `npx tsc --noEmit` clean; `npm test` 672 passed, 2 skipped; lint at the baseline (4 + 1, pre-existing); `npm run build` clean; a real `next start -p 3100`.
- Fresh browser contexts, local build and preview, at 1280 (light and dark), 900 and 390 (light and dark):
  - 14 rows, each with a live count; the Compounder row has the gold border (`--gold` in both themes) and reads kicker, title, description, "29 companies", arrow.
  - Two columns at 1280 (left edges 80 px and 664 px); one column at 900 and 390.
  - No 01–14 numbers; no filter lines on the page; every description on one line at desktop, none clipped (the longest, The Compounder's, fits its full-width row); every group heading on one line at desktop.
  - Hover on a row: title navy → gold-ink, row background → `--surface-2`, in both themes.
  - A row opens its screen's page, which still shows the why-line and its filter chips.
  - 390 px: `scrollWidth` 390, nothing sideways, light and dark.
  - No console errors.
- Tests: every screen's description is one line of at most twelve words ending in a period; the "never a pick" word check now covers the descriptions too.

## About page

Read `app/about/page.tsx` against the site after the change. Its screener paragraph says the screener "opens on a set of starting screens grouped by the question each one answers" and names The Compounder on the opening page; both still true. No feature added, removed or renamed, so no change was made.

## Judgment calls, for Eli to overrule

- **On a phone the descriptions wrap** to a second line instead of being cut with an ellipsis: at 390 px thirteen of the fourteen would be cut mid-sentence, and the row is still slim. At desktop the ellipsis rule applies (none fires today).
- The "Starting screens" kicker above "Start with a question" is gone, as in the mockup; the heading and its one-line dek stay.
- The Compounder's kicker moves to its own line on a phone, above the title.

## Left open

- Nothing in the code. Merge on Eli's go; no migration, no cron change, no About change. `feat/filter-panel` is a separate branch and touches different files (`ScreenerControls.tsx`, `filters.ts`, the panel's CSS), so the two merge independently.

## Eli's audit of the combined preview (16 November 2026)

The group headings had collapsed into 24px boxes: the panel's "?" button shared the heading's class. Fixed on the combined branch (see the filter-panel recap's audit section); `lib/screener/stylesheet.test.ts` now fails on any screener class defined twice, and the browser check fails if a heading is narrower than its column. "Open the filters" is now the outlined button. Screenshots of /screener at 1280 and 390, light and dark, are in `docs/phase-eleven/screenshots/`.
