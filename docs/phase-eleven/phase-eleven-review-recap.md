# Phase eleven: fixes after the review

9 November 2026. Branch `feat/screener`, not merged. Nothing here is on the live site. This covers Eli's ten points from the review of the whole screener, and two more problems the checks turned up. The screener's table was rebuilt with all of it the same evening (4,580 companies).

## In short

- **All ten points are in.** Each was checked on the whole universe before publishing, and against 10-K balance sheets for the large companies.
- **NVIDIA's net cash is right:** +$54.1B, as in its 10-K. The page reader that fixed it also caught KLA ($3.3B of securities) and eBay ($1.1B).
- **Two problems turned up in the top-50 check.**
  - Caterpillar's debt was short by $7.1B. It's now $43.3B, as in its 10-K.
  - Chevron's debt was $9.9B too high. That was my error in Stage D, and it's now $40.8B, as on its balance sheet.
- **No migration.** Every new fact is kept in each row's `sources` record; the sector uses its existing column.

## The ten points

### 1. ROIC without an operating income line

Where no operating income line is filed, the profit used is pretax income plus interest expense. The page marks those figures † and the notes explain the mark; the row's `sources.roic_basis` records it.
- Both figures have to be filed, so a company with no interest line stays n/a.
- Most large companies now file interest under a tag whose bulk SEC file leaves out 10-Ks filed before mid-2026. Johnson & Johnson, Eli Lilly and Merck were in that gap. The job now fetches that figure from each company's own filing data, once per annual report (92 companies).
- Results:
  - ExxonMobil 10.3%, Chevron 6.2%;
  - Johnson & Johnson 25.2%, Eli Lilly 34.6%, Merck 22.3%;
  - 87 companies in all now show ROIC on this basis.

### 2. No debt line

These stay n/a, as you decided. No change.

### 3. Companies holding customer money

Wise is now treated like a bank, and so is every company the general rule catches. Free cash flow margin and net cash are n/a for them, and so is everything built on them: Rule of 40, dividends and buybacks as a share of free cash flow, and cash conversion, which rests on the same cash flow.

The rule: money held for customers is at least a tenth of total assets and at least $25 million on the latest balance sheet. It counts:
- funds held for clients or customer funds;
- settlement balances (money in transit between card holders, merchants and banks);
- restricted cash.

Settlement balances and restricted cash count only in the payments, payroll and software industries. Elsewhere they mean other things: lawsuit settlements, mine reclamation bonds, escrow.

There are two hand-checked exceptions, both in `lib/screener/customerMoney.ts`:
- **Wise is in:** it files customers' balances as its own cash.
- **Applied Digital is out:** its restricted cash is borrowed money for building data centres.

**The rule catches 34 companies.** These 29 are newly n/a:
- PDD, PayPal, Block, ADP, Intuit, Fiserv, MercadoLibre, Airbnb, Insperity, Paychex;
- SS&C Technologies, TriNet, Corpay, Western Union, Paycom, Wise, Paylocity, ACI Worldwide, Bill, Remitly;
- Paymentus, Blackbaud, Global-E, Priority Technology, Payoneer, Upwork, Marqeta, Expensify, Asure Software.

The other five were already n/a as financial companies: Aon, Willis Towers Watson, Euronet, Ryan Specialty and Usio.

All five you named are caught. Visa, Mastercard, Global Payments, Shift4 and Toast aren't: none holds customer money worth a tenth of its assets.

### 4. Revenue growth from a small base

Revenue growth is n/a when the starting year had under $10 million of revenue. That applies to the 1-, 3-, 5- and 10-year measures, and Rule of 40 follows the 1-year one.

### 5. ROIC from a tiny capital base

The rule: ROIC above 100% is n/a unless invested capital is at least a quarter of total assets.

The five you named are now n/a. Their invested capital as a share of total assets:

| Company | Old ROIC | Invested capital ÷ total assets |
|---|---|---|
| NetApp | 510% | 2% |
| H World | 144% | 5% |
| Extreme Networks | 123% | 4% |
| Nutex Health | 109% | 20% |
| Blue Bird | 106% | 19% |

The four you wanted kept are kept:

| Company | ROIC | Invested capital ÷ total assets |
|---|---|---|
| Apple | 96.8% | 33% |
| Mastercard | 94.2% | 30% |
| NVIDIA | 107.2% | 50% |
| Adobe | 63.2% | 38% |

**Top 20, High return on capital** († = from pretax income plus interest expense):

| | Company | ROIC |
|---|---|---|
| 1 | AppLovin | 114.1% |
| 2 | NVIDIA | 107.2% |
| 3 | CarGurus | 103.6% |
| 4 | Sandisk | 99.2% |
| 5 | Apple | 96.8% |
| 6 | Mastercard | 94.2% |
| 7 | Expedia | 89.4% |
| 8 | Seagate | 86.9% |
| 9 | Micron | 86.6% |
| 10 | Chipotle | 83.0% |
| 11 | Tapestry | 81.9% |
| 12 | TJX † | 81.3% |
| 13 | Teradata | 77.6% |
| 14 | ADP † | 70.5% |
| 15 | KLA † | 69.2% |
| 16 | Lam Research | 67.9% |
| 17 | Brinker | 66.5% |
| 18 | Ross Stores | 65.7% |
| 19 | Adobe | 63.2% |
| 20 | Live Nation | 60.9% |

One thing to flag: Expedia (89%) and Live Nation (61%) have bases nearly as small as NetApp's, at 7% and 6% of assets. They stay because they're under 100%.

### 6. NVIDIA's net cash

**Now +$54.1B**: $10.6B of cash plus $52.0B of marketable securities, less $8.5B of debt.

How it's fixed:
- NVIDIA tags its marketable securities with an element of its own, which the SEC's bulk data doesn't carry.
- Each filing's statements are also published as web pages that name every line's element. The job now reads the balance sheet page wherever the bulk data shows signs of a missing line.
- It trusts the page only when the page's cash line equals the bulk data's cash. Otherwise it shows n/a.
- Each page is read once per annual report: 173 companies on the first night, then only when a new report arrives.

**The 50 largest companies by revenue:**

| Company | What was wrong | Net cash before | Net cash now |
|---|---|---|---|
| NVIDIA | securities under its own element | +$2.1B | +$54.1B |
| Caterpillar | $7.1B of debt due within a year, shown only for each of its two businesses | −$26.2B | −$33.4B |
| Chevron | short-term debt counted twice (my Stage D error, below) | −$44.4B | −$34.5B |
| Alibaba | short-term investments under its own element | already n/a | n/a |

Nothing was missing from the other 46.

Below the top 50, the same reader corrected:
- KLA: −$4.2B → −$1.0B;
- eBay: −$4.9B → −$3.8B;
- a handful of small companies.

Three small companies whose pages couldn't be verified are now n/a.

### 7. Universe Pharmaceuticals

**Revenue, net income and net cash are now n/a.**

Why the old check missed it: every dollar figure in its annual report is a thousand times too large, and all of them agree with each other. EPS (−$8.06) and the share count (455,871) are right.

The check that caught Tigo now also reads the share count on the report's cover page:
- If the cover count matches the weighted share count, the shares are right and the dollar figures aren't.
- 45 other companies' net income disagreed with EPS × shares by a factor of 1,000. None of them has a cover count close to its weighted share count; for most, the cover shows the share count was filed in thousands. Their net income is settled as before.
- **It catches nothing else.**

### 8. Sectors

`lib/screener/sectorCorrections.ts` holds the hand-checked list. All 704 companies with revenue over $5B were checked against the standard eleven-sector classification (GICS), and 94 move. InterDigital, under $5B, is also in the list because you named it.

Companies whose classification I wasn't sure of stay where SIC puts them: Leidos, CACI, SAIC, Parsons, Roper, Teledyne, Veralto, Toast, Boise Cascade, Gold.com, Arko and Murphy USA.

**Into Technology (10):**
- Accenture, TD Synnex, Ingram Micro, CDW, Insight;
- Lam Research, Corning, Gartner, Zebra, InterDigital.

**Into Financials (9):**
- Visa, Mastercard, PayPal, Block, Fiserv;
- FIS, Global Payments, S&P Global, Moody's.

**Into Consumer discretionary (26):**
- Alibaba, PDD, MercadoLibre, Sea, eBay, DoorDash, Expedia, Airbnb, Booking, Trip.com;
- Carnival, Royal Caribbean, Norwegian Cruise Line, Flutter, Marriott Vacations;
- Nike, Deckers, Goodyear, Newell, Garmin, Polaris, Brunswick;
- Genuine Parts, LKQ, Pool, ADT.

**Into Communication (11):**
- Alphabet, Meta, Netflix, Disney, Live Nation, Warner Music;
- Omnicom, Baidu, NetEase, Take-Two, Snap.

**Into Industrials (18):**
- 3M, ADP, Trane, Vertiv, Rockwell, Ametek, Hubbell;
- Paccar, Oshkosh, Cintas, Fastenal, Rush Enterprises, Builders FirstSource;
- Owens Corning, Howmet, UFP Industries, Carlisle, Icahn Enterprises.

**Into Materials (5):** Sherwin-Williams, Amcor, Corteva, Ecolab, Reliance.

**Into Consumer staples (6):** Kimberly-Clark, Casey's, Herbalife, CHS, Andersons, Seaboard.

**Into Health care (3):** CVS Health, Thermo Fisher, Danaher.

**Into Energy (6):** Baker Hughes, TechnipFMC, NOV, Cheniere, Cheniere Energy Partners, Venture Global.

**Rule of 40 changes:**
- Joined: Lam Research (47%) and InterDigital (59%). The other eight moving into Technology don't reach 40%.
- Left: Meta, NetEase and Vertiv, which moved out of Technology.

The screen filters on the sector column, so it picks the moves up with no change of its own.

### 9. Buying back shares

Added revenue ≥ $500M. The screen now finds 88 companies.

### 10. Based in New England

The revenue floor is now $100M. The screen now finds 178 companies.

## Found along the way

**Chevron's debt.** In Stage D I added Chevron's $10.9B "short-term debt" to its $39.8B of long-term debt and reported that as matching the 10-K. It didn't:
- The $10.9B comes from Chevron's debt note, before $9.9B of it is reclassified to long-term because it's being refinanced.
- The balance sheet shows $977M of short-term debt, for $40.8B in all.

The fix: debt tagged "including current maturities" is now taken at its word. Only Chevron's figure moves by more than $20M.

**Caterpillar's debt.** Its balance sheet shows debt due within a year separately for machinery ($0.04B) and its finance arm ($7.09B), and never the total, so the bulk data had nothing.
- The page reader adds those amounts only when the two businesses' figures provably add up to a consolidated line. Their short-term borrowings, $0 + $5.51B, equal the consolidated $5.51B.
- Debt is now $43.3B, as in the 10-K.

## Counts for every screen

| Screen | Before | Now |
|---|---|---|
| High return on capital | 105 | 107 |
| Revenue up ten years in a row | 130 | 130 |
| Strong free cash flow | 123 | 116 |
| Fast growth, already profitable | 139 | 136 |
| Rule of 40 | 118 | 113 |
| Margins widening | 125 | 125 |
| Fast growth, still losing money | 131 | 128 |
| Buying back shares | 106 | 88 |
| Dividends covered by cash flow | 131 | 130 |
| More cash than debt | 146 | 142 |
| Profits without the cash | 76 | 77 |
| Issuing shares fast | 131 | 130 |
| Based in New England | 131 | 178 |

## Checks

- **Tests:** 662 pass, including new ones on saved pages from NVIDIA, Caterpillar, Eversource and Fulcrum.
- **Type-check, lint and build:** the type-check and build are clean, and lint is at the 4 + 1 baseline.
- **The job, run twice:**
  - First night: 167 s, reading every balance sheet page and interest figure.
  - Next night: 104 s, with everything carried over.
  - The budget is 280 s.
- **The page, on a local production build:** the † marks and the new notes show, and the Financials sector includes Visa and Mastercard.
- **Data sources:** SEC only. No Twelve Data or Finnhub calls.

## Not done

- The research file uses the same units rule but not the cover-page check, so Universe Pharmaceuticals' research page still shows $17.9B. That's a separate change to the normaliser, outside the screener.
- Wise, under $5B revenue, still shows as Industrials. Under the standard classification it would be Financials.
