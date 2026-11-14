# Phase ten, Stage B: Recently viewed

Written 2 November 2026. Branch `feat/research-site`. The brief is `docs/phase-ten/phase-ten.md`.

## What a student sees now

- **On the home page, just under the search box, a Recently viewed section.**
  - It has the heading "Pick up where you left off", with "Saved on this device only" and a Clear all button beside it.
  - It holds up to eight cards, newest first. Each shows the ticker, the company name, and when it was viewed and on which tab, for example "2 hours ago · Valuation".
  - A card opens that company on that tab. Each card has an ✕ button to remove it.
  - The section only appears once there's something in it, so a first visit shows nothing new.
- **On `/research`, the same section sits under the search.**
- **The search box offers recent companies.** Clicked into while empty, it drops down a "Recently viewed" list of the latest five, a Clear button, and the line "Type to search every U.S. company by ticker or name."
  - Typing swaps it for the usual search results; emptying the box brings it back.
  - The up and down arrows move through it, Enter opens the highlighted company, and Escape closes it.
- **Time labels:**
  - "Just now", then "5 minutes ago" and "2 hours ago" on the same day.
  - "Yesterday", then "3 days ago" up to a week.
  - "Last week" up to two weeks, then the date (with the year once it's a different year).
- **Everything stays in the visitor's own browser.** It needs no account, works the same signed in or out, and nothing reaches the server or the database.

## How it works

- **`lib/recent.ts`** holds the list under the key `dispatch.recent.v1`. It offers `readRecent`, `addRecent`, `removeRecent` and `clearRecent`, plus the time labels and the link for each entry.
  - It keeps twelve companies; the page shows eight and the dropdown five.
  - Adding a company already listed moves it to the top with its new tab.
- **Nothing in storage can break the page:**
  - Every read and write is guarded, so a private window, blocked storage or a corrupted value gives an empty list.
  - Each stored entry is checked before use. A ticker must match the site's ticker rule, the name must be text of reasonable length, the tab must be one of the six, and the time a real number. Anything else is dropped, and only the newest entry per company is kept.
  - Names are only ever shown as plain text.
- **Recording.** A small piece in the company layout records the visit after the layout's 404 checks.
  - It only records tabs that the layout actually lists for that company. A tab that 404s inside the layout (Financials for a fund, say) is never recorded, and neither is an unknown ticker.
  - Clicking from tab to tab updates the entry.
- **Showing.** The list is read with `useSyncExternalStore` (`lib/useRecent.ts`).
  - The server renders nothing, and the list fills in after the page loads, so there's no mismatch and the pages stay cacheable.
  - A second open tab updates on its own.
  - The stored text is cached, so React gets the same list until it really changes.
- **No prefetching.** Every recent link has `prefetch={false}`. In this version of Next.js that means nothing loads on view or on hover (checked in its own docs).

## How it was checked

- **Tests:** 17 new unit tests for `lib/recent.ts`. They cover:
  - add, move to top, the cap at twelve, remove and clear
  - corrupted JSON, storage that throws on every call, storage that can't even be reached, and entries of the wrong shape
  - the snapshot staying the same array, the tab-from-address rule, the links and every time label

  All 338 tests pass. `tsc` is clean, the build is clean, and lint adds nothing new (the same five old items as Stage A).
- **In a real browser on `next start`:**
  - **Visit order:** opening NVDA Overview, then COST Valuation, then JPM Insiders left the home page showing JPM, COST, NVDA in that order, each with its tab, linking to that tab.
  - **Remove and Clear all:** removing Costco worked, moved keyboard focus to the next card's ✕, and survived a reload. Clear all emptied the list, and that also survived a reload.
  - **Not recorded:** a fund's missing Financials tab (`/research/qqq/financials`) and an unknown ticker. Clicking from Earnings to Filings updated the entry.
  - **Dropdown:**
    - Closed until the box is focused, then the latest five.
    - The heading and the "Type to search" line show, and the arrow keys move the highlight.
    - Escape closes it and ArrowDown reopens it. Typing "apple" swapped it for results, and emptying the box brought it back.
    - Enter on the second entry opened Costco's Valuation tab. Clear emptied it and kept focus in the box.
  - **A second tab** showed a company opened in the first, without a reload.
  - **Eight recent companies on the home page** cost no request for any of them, whether in view or hovered, in the cards or the dropdown. The server log shows no call to Twelve Data, the SEC or Finnhub during the visit. The only other requests were the nav bar's usual prefetch of Home, Research, About and Give.
  - **Fresh private window:** no section, no dropdown, no console errors.
  - **Blocked storage** (the browser refusing all access): the pages render with no section and no errors.
  - **Width and theme:** no sideways scroll at 390 in light or dark. The Stage A sweep of every page (48 loads) is still clean.

## Where this deviated

- **No dropdown in the nav yet.** The brief puts the dropdown in "the new nav search on company pages", but that nav search is built in Stage C. The dropdown lives in `CompanySearch`, so the compact nav version will carry it from the start.
- **The dropdown stays shut on page load.** `/research` puts the cursor in its search box as the page loads. Opening the dropdown then would cover the same list shown just below it, so it waits for a click or a key. The browser's repeat focus event when the window regains focus is ignored the same way.
- **No empty dropdown.** With no recent companies, the dropdown doesn't appear at all; the board showed "Companies you open will show up here." Otherwise `/research` would show that empty box to every first-time visitor.
- **Placement is provisional.** The home page section sits directly under the hero, which is also "before Start with a company". Stage C reorders the home page to match the board.
- **Styling is interim.** The section is styled in the site's current look, with sizes from the Home board; Stage C restyles it with everything else.

## What the brief got wrong

- **The nav search doesn't exist yet**, so the dropdown can't be there in Stage B (see above). Otherwise the brief held up.
