# Phase ten, Stage C: the visual refresh

Written 2 November 2026. Branch `feat/research-site`. The brief is `docs/phase-ten.md`; the boards are in `docs/design/phase-ten/`.

## What a student sees now

The same site and the same numbers, set for reading: bigger type, more room between sections, hairlines instead of boxes, and gold used only for "now" (the latest bar or column, today's dot, the open tab).

- **Masthead and nav.**
  - A dark masthead in both themes. On a phone it shows a short date, so it no longer wraps.
  - The nav has the logo, then the links, the theme toggle and a Sign in button. Every control is at least 44px tall.
  - **Company pages also get a compact search in the nav,** with the Recently viewed dropdown from Stage B.
  - **On a phone,** the nav is the logo, a search button and a menu button; the links open as a panel.
  - "Research" is marked as the open link on every company page.
- **Company header.**
  - The name at 60px, with the ticker in a small outlined tag.
  - The price at 40px, and the day's change in a tinted pill with an arrow (▲ or ▼), so a rise or fall never relies on colour alone.
  - On the right, a slim 52-week bar with a gold dot for today, and a "Next earnings" row.
- **Tabs.** 52px tall, with a gold underline on the open one. On a phone they scroll sideways with no visible scrollbar.
- **Every section opens the same way:** a short gold dash, a small label, then a real heading. There is 72px between sections on a computer and 44px on a phone.
- **Overview, in the board's order:**
  - "In its own words" is set large under a gold quote mark.
  - "What stands out" is three columns, each a big figure ("43×", "71.1%", "$40.1B") over its sentence.
  - The price chart is in one panel:
    - the move stated at 22px, signed and coloured
    - the eight ranges as one segmented control
    - gridlines at the high, middle and low, with prices on the right
    - a light fill under the line, and today as an ink dot with a gold ring
    - earnings dots as before, and the legend under a hairline
  - The key numbers are an open grid with hairlines.
- **Financials, as the board:**
  - The chips and the Annual/Quarterly switch on one row.
  - Ink bars with the latest in gold, the value above each, and the year-on-year change under each year (annual amounts only).
  - A table with mono headers and section names in small capitals. Growth and the margins sit tucked under the line they describe. The latest column is on a gold wash, rows highlight on hover, and the line names stay put while the figures scroll.
- **Valuation, Earnings, Insiders and Filings** use the same system: a label and heading per section, the same panels, tables, chips and switches, and gold only for the latest figure. The Earnings outlook hatch is unchanged.
- **Try-again and not-available messages** are tinted, with an info icon and no border.
- **Home, as the board:**
  - A taller hero with the 62px search box and a solid "Open file" button.
  - "Try" links, then Recently viewed.
  - The example companies as an open grid under ink rules.
  - "What's in a file" as a numbered list from 01 to 06.
  - Screener and Compare as dashed "Coming" cards.
  - "How it works" as three short columns.
- **Type.**
  - Inter now loads with its optical-size axis, so the big headlines use its tighter display cut.
  - Body text on research pages is 16px, labels are 11.5px Plex Mono, and figures use even-width digits.
- **Colours.**
  - The new tokens are set in all three places the theme is defined (light, dark, and the system-dark fallback).
  - The greys are adjusted: muted is #56657a in light and #93a0b2 in dark, and the hairline is #e3dbcb and #223041.
  - Falls in dark mode are #e58a8a.
  - Gold text uses the darker gold-ink.

## How it was checked

- **Code.**
  - `tsc` is clean and the build is clean.
  - All 340 tests pass. Two are new, for the "What stands out" figures: every real company's figures, and that each figure appears in its own sentence.
  - Lint adds nothing new; the same five older items remain.
- **Screenshots.** I took full-page screenshots of every NVIDIA tab, the home page with and without recent companies, and /research. That's at 1280 and 390 wide, light and dark: 36 pages. I compared them with the boards; differences are listed below.
- **No sideways scroll** at 390 on any page, in either theme. Wide tables scroll inside their own box.
- **Colour contrast.** Every piece of visible text on 11 pages was measured against the background actually behind it, in both themes, with the search dropdown open as well. The pages were the home page, /research, all six tabs, a fund, About and Give.
  - **Nothing fails** 4.5:1 for body text and labels, or 3:1 for text 24px and up.
  - I confirmed the scanner works by planting two bad colours; it caught both.
- **Keyboard.** Tab reaches every control in reading order, on a company page, the home page and the phone layout. Every stop shows a gold focus ring.
  - Focusing the nav search opens the recent list, which Tab walks through before moving on.
  - On a phone, the closed menu and search panels stay out of the Tab order.
- **The nav, in a browser:**
  - On a computer, the nav search's dropdown lists recent companies, typing shows results, and Enter opens a typed ticker.
  - On a phone, the search button opens the search with the cursor in it, and Escape closes it.
  - The menu button opens the links, and following one closes the menu. Every menu control is at least 44px.
  - No console errors.
- **Stage A and B checks rerun on the final build.** The 48-load sweep is clean (the made-up ticker's own 404 aside), and every Recently viewed check passes. A home visit with eight recent companies still costs nothing.
- **Banned words.** The phase nine scan ("fair value", "target", "undervalued", "overvalued", "buy", "sell", "hold", plus "upside" and "downside") ran on 22 pages: home, /research, every tab for NVIDIA, JPMorgan and Coca-Cola, About and Give.
  - Every research page is clean in the site's own words.
  - The only matches are inside companies' quoted risk factors (JPMorgan's own "fair value", for example), quoted as filed.
  - The About page still says "what to buy" and "Did the thesis hold?" from the memo days. It is already on the list for a rewrite, so I left it alone.
- **Twelve Data.** A full click-through of NVIDIA (the Overview, all eight chart ranges, then every tab) makes the same requests as before the refresh: the two chart requests (1D/1W and MAX) and three per tab.
  - On the way I found the Insiders page's own "All transactions" link being prefetched, since it now sits higher on the screen. It cost no Twelve Data, but each prefetch rendered the page again, so prefetch is off on those two links.

## Where it couldn't match, or deviated

- **The quote mark is in Georgia, not Newsreader.** The board draws it in Newsreader, but the brief says to build neither of the two looks to try. I didn't load a third font for one decorative mark.
- **Long names push the ticker tag to its own line on a phone.** "NVIDIA Corporation" is longer than the board's "NVIDIA".
- **Chart price labels keep their cents** ($239.24) where the board rounds ($214). The site keeps every figure as it computes it.
- **The Financials table's first header is the unit** ("$ billions") rather than the board's "Line", so the unit stays beside the figures.
- **The bars' growth row is new arithmetic,** each year against the one before, rounded the same way as the table's growth row. The brief asks for it. It's shown for annual amounts only: quarter on quarter would mostly measure the seasons.
- **Headings for the four tabs not on the canvas are mine.** Please read them:
  - **Valuation:**
    - "The growth today's price assumes"
    - "Cash, earnings and repurchases against market value"
    - "Today's multiples against past quarter-ends"
    - "The same figures for similar companies"
  - **Earnings:**
    - the next report's date as the heading
    - "Revenue by quarter" and "Diluted EPS by quarter"
    - "The company's own outlook against what it then reported"
    - "EPS against the average estimate"
  - **Insiders:**
    - "Purchases and sales on the open market"
    - "Each purchase and sale, as filed"
  - **Filings:**
    - "The risk factors in the latest annual report, against the year before"
    - "Every recent report"
- **Home page wording now follows the board's copy:**
  - the hero line now mentions insider trades and the risk factors
  - the three "How it works" items
  - "Two companies side by side, from the same filings"
- **"What's in a file"** also says "Each opens NVIDIA's, as an example", since the numbered items are links.
- **The site footer** is now a dark band in both themes, and its data line names SEC EDGAR as well.
- **Chart captions** use "×" for multiples ("4,800×"), as the board does, instead of "x".
- **The header's session label** reads "Today", or "At close, Oct 30" for a past session, as on the board.
- **Stage B's leftover, done:** the Recently viewed dropdown now appears in the nav's search on company pages.

## What the brief got wrong

- **"Every nav control at least 44px tall."** The nav search box is 44px tall as drawn. The text box inside it measures 42px because of the box's border; the whole 44px box is the control. Everything else is 44px or more, the logo included (it was 39px; now fixed).
- **The canvas names some tokens differently from the site.** `--ink` is `--navy`, `--bg` is `--cream`, `--neg` is `--accent` and `--pos` is `--green`. The brief said this; kept as the site's names.

## Found on the way, not changed

- **A company name typed into a search box and Enter goes to a missing page.** Type "costco" and press Enter, and the box goes to `/research/costco` rather than Costco's file, because any single short word is treated as a ticker. That's how funds like QQQ are reached, and it behaved the same before this stage. Picking a result with the arrow keys or the mouse works. It's worth a small fix: prefer a matching name over a guessed ticker.
- **The About page's memo-era wording** (see Banned words above).
