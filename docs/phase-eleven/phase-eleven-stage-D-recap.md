# Phase eleven, Stage D: the fixes, every filter, and screens investors use

7 November 2026. Branch `feat/screener`, not merged. Nothing here is on the live site. This covers both parts of the round Eli sent after Stage C: the five fixes to the numbers, then Stage D with the addendum (`docs/phase-eleven/phase-eleven-screens.md`).

## In short

- **The five fixes are in, each checked against 10-Ks:** net cash, believable-but-wrong gross margins, revenue from the 10-K, the funds left out, and names. Two more problems turned up and are fixed: ExxonMobil was missing, and "buybacks" that were really changes in share counting.
- **Every filter is in.** The main ten, now with return on invested capital, and behind "More filters" the brief's seventeen plus the addendum's three new measures.
  - Each filter says in one line what it measures, and where the middle company sits ("Half of companies: above 5.5%").
- **The thirteen starting screens** from the addendum are in, grouped under the question each answers. Each is tuned to between 76 and 146 companies.
- **The page reads for someone who's never used a screener:**
  - each screen restated in a sentence, with full column names;
  - a link from every company to what its price assumes;
  - "build your own" starting at revenue of $100 million or more.
- **Every check passed:** tests, a real browser click-through, 23 screens counted independently, phone width, light and dark mode, zero Twelve Data or Finnhub calls, and the forbidden-words check.
- **Decisions for you are at the end.** Two are about return on invested capital, and some oddities in the lists are worth a look.

## Part 1: the five fixes

### 1. Net cash, both sides

Cash is now cash plus short-term investments. Debt is now long-term debt plus short-term borrowings and commercial paper, with anything due within a year counted once:
- **Cash side:** where a company files its own total of cash and short-term investments, that total is used. Otherwise its cash plus one short-term investment line, never several added together, which never once matched a company's own total in testing.
- **Debt side:** short-term debt is added only when the long-term figure leaves it out.

Your six, against their latest 10-K balance sheets:

| Company | Net cash before | Net cash now | 10-K |
|---|---|---|---|
| Alphabet | −$18.4B | +$77.8B | +$77.8B ($126.8B cash and investments, $49.1B debt) |
| Microsoft | −$19.4B | +$36.5B | +$36.5B ($76.8B, $40.3B) |
| Meta | −$22.9B | +$22.8B | +$22.8B ($81.6B, $58.7B) |
| Apple | −$41.8B | −$23.4B | −$23.4B ($56.7B; $78.1B debt plus $2.0B commercial paper) |
| Chevron | −$33.5B | −$44.4B | −$44.4B ($6.3B; $39.8B long-term plus $10.9B short-term debt) |
| NVIDIA | +$2.1B | +$2.1B | **+$54.1B** |

**NVIDIA is the one miss.** It tags its $52.0B of marketable securities with a label of its own, which the SEC's bulk data doesn't carry. The only standard tag it files covers $39.5B of debt securities without saying they're short-term; using that tag would also count Duke Energy's nuclear decommissioning fund and Caterpillar's insurance holdings as cash. So NVIDIA's cash side is its cash alone, $10.6B.

Caterpillar is a smaller case of the same kind: it labels its long-term debt due within a year its own way, so that part isn't counted.

**"More cash than debt" (revenue $1B+):** 155 companies before, 172 now. Your new screen, which adds positive free cash flow, finds 146.

### 2. Gross margin that's believable but wrong

**The rule.** Where a company reports no gross profit line itself, the screener works the margin out from the one cost line it tags as cost of revenue. That margin is now n/a when both of these hold:
- more than 25 points of revenue sit between it and operating profit;
- the company's own selling, admin, R&D and write-down lines explain less than a third of that gap.

A gross profit a company reports itself always stands. Utilities without a gross profit line are n/a too, since their cost line is fuel and purchased power alone.

**Why it doesn't blank the real ones.** At a software or drug company, the gap is almost all selling, admin and research, which those companies file. Vertex, Lilly, Meta, Airbnb and Tripadvisor keep their margins.

**70 companies change** (full list at the end). By group:
- **Utilities:** 11, including CenterPoint.
- **Oil and gas:** 18, including EQT, Chevron and ConocoPhillips.
- **Restaurants and leisure:** for example Cracker Barrel and Planet Fitness.
- **Hospitals:** Community Health.
- **Cable:** for example Liberty Latin America.
- **Shipping:** for example Teekay.
- **Others:** Amazon and CVS.

Two companies now show a gross margin they didn't: JAKKS, now that its revenue is right, and Black Titan.

**Five spot-checks against the 10-K income statements:**

| Company | Was | What the 10-K shows |
|---|---|---|
| CenterPoint | 100.0% | The tag it files as cost of revenue is a $4M non-utility line. Its $2.1B of fuel and purchased power, $3.0B of operations and $1.5B of depreciation carry other tags. |
| Community Health | 85.1% | The cost it tags is "Supplies", $1.86B of $12.49B. Salaries ($5.41B) and other operating costs are separate lines. |
| EQT | 82.3% | The cost it tags is transportation and processing alone ($1.53B). Production, operations and $2.60B of depreciation sit below it. |
| Amazon | 50.3% | Cost of sales $356.4B leaves out $109.1B of fulfillment, and Amazon reports no gross profit line itself. |
| Illinois Tool Works | 52.9% | Wrong outright: the income statement's cost of revenue is $8.97B (a 44% margin), but the screener had been reading a $7.56B tag. n/a is better than a wrong number. |

### 3. Revenue from the 10-K

Revenue now gets the same treatment net income already had:
- **When it applies:** where the SEC's bulk file holds a figure from a different filing than the rest of the year, the job fetches the 10-K's own figure.
- **10-K first:** an annual figure is now taken from a 10-K before a 10-Q. JAKKS's error came from a 10-Q, filed after its 10-K, that labelled one quarter as the whole year.
- **Net income too:** the same rule now covers net income. Older net income fixes that hadn't come from the year's own 10-K were fetched again, for 69 companies.

All 24 companies from Stage C, before and after:

| Company | Before | After | What happened |
|---|---|---|---|
| Astronics (ATRO) | $862.1M | $862.1M | 10-K says the same |
| Caterpillar (CAT) | $67,589M | $67,589M | 10-K says the same |
| Essential Utilities (WTRG) | $2,474.6M | $2,474.6M | 10-K says the same |
| Argan (AGX) | $944.6M | $944.6M | 10-K says the same |
| Energy Focus (EFOI) | $3.6M | $3.6M | 10-K says the same |
| **JAKKS Pacific (JAKK)** | $113.3M | **$570.7M** | taken from the 10-K |
| **Comfort Systems USA (FIX)** | $1,831.3M | **$9,101.6M** | taken from the 10-K |
| Flux Power (FLUX) | $42.1M | $42.1M | 10-K says the same |
| BGC Group (BGC) | $2,941.5M | $2,941.5M | 10-K says the same |
| Nephros (NEPH) | $18.8M | $18.8M | 10-K says the same |
| Neuronetics (STIM) | $149.2M | $149.2M | 10-K says the same |
| ClearPoint Neuro (CLPT) | $37M | $37M | 10-K says the same |
| SemiLEDs (LEDS) | $43M | $43M | 10-K says the same |
| **FitLife Brands (FTLF)** | $15.9M | **$81.5M** | taken from the 10-K |
| Vuzix (VUZI) | $6.3M | $6.3M | 10-K says the same |
| Arcadia Biosciences (RKDA) | $4.9M | $4.9M | 10-K says the same |
| Azio AI (AZIO) | $5.9M | $5.9M | 10-K says the same |
| **AH Realty Trust (AHRT)** | $209.9M | **$285.2M** | taken from the 10-K |
| Bonk (BNKK) | $2.1M | $2.1M | 10-K says the same |
| Avita Medical (RCEL) | $71.6M | $71.6M | 10-K says the same |
| **Owlet (OWLT)** | $106.2M | **$105.7M** | taken from the 10-K |
| Xos (XOS) | $46M | $46M | 10-K says the same |
| Alpha Modus (AMOD) | $0M | $0M | 10-K says the same |
| a.k.a. Brands (AKA) | $600.2M | $600.2M | 10-K says the same |

**The prior year is checked the same way.** That corrected growth figures where the year before had come from the wrong filing: Herc's 1-year growth goes from +639% to +23%, Beacon Financial's from −92.5% to +81.1%.

**The cost:** the first run fetched 131 revenue figures. Since then each night reuses all but one.

### 4. The commodity and crypto funds are out

68 of them are now excluded, for example SPDR Gold, iShares Bitcoin and United States Oil:
- **The rule:** the SEC files these funds under commodity dealers (6221) or other financial services (6199), and the name settles it ("Trust", "Fund" or "ETF").
- **Three businesses share that code and stay:** Uranium Royalty, Antalpha Platform and AI Financial.
- **Lending funds also stay** (Blackstone Secured Lending and two others): they lend to businesses, and they sit under other codes.

The screener now covers 4,579 companies, "about 4,600" on the page.

### 5. Company names

The job now chooses and writes each name:
- **Which version:** the SEC holds two versions of each name. Where either is in mixed case, that one is used: ServiceNow, SharkNinja, EQT, T-Mobile US.
- **Capitals read as a person would:** short initials are kept (UFP Industries, AES), small words are lowered (Bank of America).
- **A checked list** covers names the SEC holds only in capitals that no rule can work out: NVIDIA, JPMorgan Chase, PulteGroup, News Corp, Coca-Cola, Charles Schwab, CarMax, NextEra, MSCI and about twenty more. I checked every company with $500M+ of revenue.

Bank of America no longer shows as "BofA Finance".

**Smaller companies whose names the SEC holds only in capitals** can still come out imperfectly, for example a brand's inner capital.

### Two more fixes the checks turned up

- **ExxonMobil was missing entirely.** In 2026 it moved under a new holding company. The SEC's ticker file gave XOM to the new company at once, but the annual figures stay with the old company until the new one files its first 10-K. XOM now follows the old company until then. I checked every filer with $5B+ of 2025 revenue and no ticker; this was the only such case.
- **A share count can't fall by half in a year through buybacks.** Brilliant Earth showed −85%: its other share class stopped being counted. A fall that size is now n/a, so the "Buying back shares" screen can't mistake one for buybacks. Stock splits were already handled; NVIDIA and Broadcom show ordinary changes.

## Part 2: what a visitor now sees

**The opening page:**
- **Thirteen starting screens, under six headings:** Quality, Growth, Shareholder returns, Balance sheet, Read closely, and Close to home.
- **Each card shows:** the title, the "why" line, the filters in plain words ("A net loss", "More cash than debt"), and the live count.
- **"Build your own"** opens every company with revenue of $100 million or more. A quiet note says smaller companies are hidden until that filter is removed.

**A screen:**
- **Under the title:** one sentence restating it ("Companies with revenue of at least $500 million and a return on invested capital of 25% or more."), then its "why" line.
- **The table:**
  - The screen's own measure comes first after the company, then the other filters, then revenue.
  - Every column has its full name, never an abbreviation.
  - Each company links to its research file, with a second small link, "What the price assumes", to its Valuation tab.
  - A headquarters column appears when you filter by state.

**The filter panel:**
- **Instructions first:** one line on how to type (20 or 20%; 500M, 1.5B or $2B).
- **Under each filter's name:** its plain-English definition and where the middle company sits.
- **"More filters"** opens the rest:
  - returns on equity and assets;
  - net income and earnings per share growth;
  - operating margin change over 3 years;
  - revenue growth plus free cash flow margin;
  - cash conversion;
  - spending, dividends and buybacks;
  - debt to equity, current ratio and interest coverage;
  - 5- and 10-year growth and "years in a row".
- **"Pays a dividend"** offers only Yes and Either.
- **Headquarters** is a list of states, with an "All of New England" button.
- **A box that can't be read** gets a short note beside it and is left out.

**The five Stage C screen addresses that no longer exist redirect to `/screener`.** More cash than debt kept its address.

### The thirteen screens, as tuned

The addendum's thresholds were starting points, to be tuned so each screen finds roughly 15 to 150 companies. Where I changed one, the addendum's value is in brackets, with its count:

| Screen | Final thresholds | Companies |
|---|---|---|
| High return on capital | ROIC 25%+ (20%), revenue $500M+ | 105 (187) |
| Revenue up ten years in a row | 10 years, revenue $2B+ (no floor) | 130 (200) |
| Strong free cash flow | FCF margin 25%+, revenue $1B+ | 123 |
| Fast growth, already profitable | growth 20%+, operating margin 10%+, revenue $200M+ | 139 |
| Rule of 40 | 40%+, technology, revenue $200M+ | 118 |
| Margins widening | up 10+ points (5), revenue $2B+ ($200M) | 125 (596) |
| Fast growth, still losing money | growth 30%+, a net loss, revenue $100M+ | 131 |
| Buying back shares | shares down 6%+ (3%), positive free cash flow | 105 (334) |
| Dividends covered by cash flow | pays one, 40% of FCF or less (60%), revenue $10B+ ($500M) | 131 (561) |
| More cash than debt | more cash than debt, positive FCF, revenue $1B+ | 146 |
| Profits without the cash | a net profit, cash conversion 0.5× or less, revenue $200M+ | 76 |
| Issuing shares fast | shares up 30%+ (10%), revenue $100M+ | 131 (313) |
| Based in New England | six states, revenue $500M+ (no floor) | 131 (336) |

The 105 for "High return on capital" is after the negative-equity rule (below); it was 134 before it.

**Strict and inclusive bounds.** "Net cash > 0", "net income < 0" and "free cash flow > 0" are filtered inclusively ("0 or more"), as the boxes are. No company's net margin, free cash flow margin or net cash is exactly zero, so the results are the same.

### The first ten of each

**High return on capital:** NetApp 510%, H World 144%, Extreme Networks 123%, InterDigital 120%, AppLovin 114%, Nutex Health 109%, Blue Bird 106%, CarGurus 104%, Sandisk 99%, Apple 97%.

**Revenue up ten years in a row** (by 10-year growth): Sarepta +111%, QXO +74%, Celsius +65%, Snap +59%, Exelixis +51%, Invitation Homes +47%, Zscaler +45%, MongoDB +44%, Twilio +41%, HubSpot +33%.

**Strong free cash flow:** Wise 398%, Permian Resources 71%, Verisign 65%, Northern Oil and Gas 61%, Sandisk 57%, Kanzhun 54%, MercadoLibre 53%, Mastercard 52%, MSCI 49%, Visa 48%.

**Fast growth, already profitable:** Arrowhead +23,258%, Keros +6,775%, Prairie Operating +2,944%, CorMedix +617%, Micron +256%, Cohen +246%, Credo +206%, Expand Energy +186%, Venture Global +177%, Sandisk +175%.

**Rule of 40:** T1 Energy +25,575%, Micron +301%, Credo +236%, Sandisk +232%, Toyo +151%, Astera Labs +148%, NVIDIA +110%, Exzeo +107%, Palantir +103%, Reddit +101%.

**Margins widening:** Bakkt +3,585 points, Teladoc +557, Rivian +347, Clarivate +151, BeOne +135, Micron +112, Illumina +110, Coinbase +105, Alnylam +89, AppLovin +78.

**Fast growth, still losing money:** Arrowhead +23,258%, QXO +11,925%, Ideaya +3,024%, Century Therapeutics +1,557%, Liquidia +1,031%, Gevo +849%, ImmunityBio +668%, Cango +665%, Eos Energy +632%, Syndax +628%.

**Buying back shares:** BioStem −22.9%, MicroAlgo −20.7%, Shift4 −20.1%, Talen Energy −19.1%, InMode −18.8%, Dropbox −15.6%, Insight Enterprises −15.2%, Spectrum Brands −15.1%, Perion −15.0%, PVH −14.5%.

**Dividends covered by cash flow** (lowest share first): Lumen 0.3%, NVIDIA 1.0%, Micron 1.0%, Gold.com 1.9%, Textron 1.9%, PayPal 2.3%, Jabil 2.5%, Vertiv 3.5%, Quanta 3.7%, GM 3.7%.

**More cash than debt:** Alphabet $77.8B, Amazon $53.7B, Micron $40.6B, Tesla $37.5B, Microsoft $36.5B, Wise $32.1B, Meta $22.8B, Costco $15.1B, GE Vernova $8.5B, AMD $7.3B.

**Profits without the cash** (lowest first): PennyMac Mortgage −56.4×, Tokyo Lifestyle −14.4×, Katapult −8.7×, Li Auto −7.6×, NCR Voyix −3.4×, Super Micro −3.1×, 3D Systems −2.9×, AerSale −2.7×, LGI Homes −1.9×, Kratos −1.9×.

**Issuing shares fast:** Hyperscale Data +9,945%, Universe Pharmaceuticals +3,175%, UWM +1,336%, Rocket +838%, Gemini +664%, Heartflow +587%, SailPoint +550%, Beta Bionics +537%, Creative Media & Community Trust +441%, Firefly Aerospace +440%.

**Based in New England** (by revenue): CVS Health, Cigna, TJX, Charter, Thermo Fisher, Philip Morris, GE Vernova, United Natural Foods, Hartford, Booking.

**What the lists show** (my notes for your sanity check):
- **The titles hold.** Most lists look like what they promise: Apple and Visa in the quality screens, Micron and NVIDIA in growth, Alphabet and Microsoft holding more cash than debt.
- **Tiny starting points give huge percentages.** Arrowhead's revenue grew from a small base on a licensing payment; Bakkt's margin rose from −3,500% three years ago. The figures are right but dominate a sort. Possible fix: require a minimum prior-year revenue for growth (the brief only says n/a at zero or below).
- **Wise** tops "Strong free cash flow" and sits sixth in "More cash than debt". Its cash and cash flow include customers' money moving through its accounts. See decision 3.
- **Universe Pharmaceuticals'** $17.9B of revenue is almost certainly a thousands-for-dollars error in its own filing. Its figures agree with each other, so the units checks can't catch it.
- **PennyMac Mortgage**, a mortgage REIT, tops "Profits without the cash" because its operating cash flow includes mortgages it buys to sell. Equity and mortgage REITs share one industry code, so a rule can't tell them apart.
- **Sectors still follow the SEC's industry codes:** Visa, Mastercard and MercadoLibre count as Industrials ("business services"), as Stage A explained.

## Return on invested capital: five spot-checks

Recomputed by hand from each 10-K's operating income, tax rate, debt, equity, and cash and short-term investments:

| Company | By hand from the 10-K | Screener |
|---|---|---|
| Apple (year to Sep 2026) | 96.84% (tax 17.0%; invested capital $135.5B) | 96.84% |
| Microsoft (Jun 2026) | 30.83% (19.4%; $405.8B) | 30.83% |
| Home Depot (Feb 2026) | 24.35% (23.9%; $65.3B) | 24.35% |
| Adobe (Nov 2025) | 63.24% (18.4%; $11.2B) | 63.24% |
| Coca-Cola (Dec 2025) | 17.72% (17.9%; $63.8B) | 17.73% |

**The Coca-Cola difference** is $56M of debt (0.1%) in the tag the screener reads, against the balance sheet's three debt lines: $1.55B of notes, $1.82B of current maturities and $42.12B long-term.

**One rule added:** return on invested capital is n/a when equity is zero or below, as return on equity and debt to equity already are. Without it, McKesson (−$2.2B of equity) showed 1,348% and Unisys 1,550%.

## Where the middle company sits

Across the companies with a value (n/a left out):

| Measure | Middle | Companies |
|---|---|---|
| Revenue | $552.6M | 3,864 |
| Revenue growth, 1 year | +6.3% | 3,736 |
| Revenue growth, 3-year average | +4.2% | 3,395 |
| Gross margin | 37.2% | 2,313 |
| Operating margin | 1.8% | 3,285 |
| Net margin | 1.9% | 3,794 |
| Free cash flow margin | 3.4% | 2,860 |
| Return on invested capital | 5.5% | 1,561 |
| Net cash or debt | −$310.9M | 2,166 |
| Share count change, 1 year | +1.5% | 4,126 |
| Return on equity | 3.5% | 4,055 |
| Return on assets | 0.7% | 4,555 |
| Net income growth, 1 year | +3.6% | 2,411 |
| Earnings per share growth, 1 year | +3.5% | 2,237 |
| Operating margin change, 3 years | +0.6 points | 2,870 |
| Revenue growth plus free cash flow margin | +9.2% | 2,800 |
| Cash conversion | 1.58× | 1,946 |
| Research and development, share of revenue | 11.5% | 1,832 |
| Capital spending, share of revenue | 2.7% | 2,939 |
| Sales and admin costs, share of revenue | 28.0% | 2,443 |
| Dividends, share of free cash flow | 28.4% | 851 |
| Buybacks, share of free cash flow | 41.5% | 1,218 |
| Debt to equity | 0.63× | 1,945 |
| Current ratio | 1.92× | 3,783 |
| Interest coverage | 0.69× | 1,221 |
| Revenue growth, 5-year average | +8.4% | 2,958 |
| Revenue growth, 10-year average | +5.7% | 1,899 |
| Years in a row of revenue growth | 1 | 3,801 |
| Pays a dividend | 36% of all 4,579 do | |

**Why the middle of the margins is so low** (1.8% operating, 1.9% net): many small companies lose money. That's exactly what makes these lines useful to a beginner: a 10% operating margin is well above the middle.

**How the medians are stored and published.** Each nightly run works them out and stores them in the run log. They're published in the same single step as the rows, so they always describe the set on show.

## The checks

1. **Type-check, tests and build** are clean. 613 tests pass. Lint shows the same four errors and one warning as before; nothing new.
2. **A real production server, checked with direct requests:**
   - the opening page and all thirteen screens answer 200 and can be indexed, each with its own canonical address and description;
   - custom combinations are marked "don't index", pointing to `/screener`; the tag sits in the page head;
   - a made-up screen answers a real 404;
   - the five retired addresses redirect (308) to `/screener`.
3. **Accuracy, against my own filtering of every row:** all thirteen screens and ten custom combinations match the page's count and its first 50 rows, in order. The combinations cover every kind of new filter:
   - ratios and points;
   - headquarters, including "Outside the U.S.";
   - "pays a dividend";
   - descending and ascending sorts.
4. **A fresh, signed-out browser click-through:** all 26 steps pass. They cover:
   - the cards and the sentence;
   - the screen's own sort, the back button and Show 50 more;
   - building your own: More filters, the New England button, the dividend Yes, typing "15%" and "1x";
   - the chips, copy link and removing a chip;
   - the valuation link and the phone's sort menu.
5. **390 px wide:** nothing scrolls sideways on any screener page, in either theme.
6. **Light and dark mode:** both checked at desktop and phone width, with the filter panel open.
7. **Twelve Data and Finnhub:** zero calls during the click-through. The browser contacted only the site and Google Fonts, and the server logged no provider calls.
8. **Forbidden words:** none in our wording. They appear only in company names: Target in the all-companies list, Best Buy in "High return on capital".
9. **The nightly job:**
   - The first run with the new code took 121 seconds: 466 files, 82 MB, plus the one-off 10-K fetches.
   - A normal night takes 89 to 100 seconds, against the 300-second limit.
   - A second run changed nothing: all 4,579 rows were identical.
   - The inline failure messages still show when the database reads are made to fail on purpose (`SCREENER_FORCE_FAILURE`).

## Where I departed from the brief and the addendum

- **Thresholds:** six screens' thresholds were tightened, and two got a revenue floor, to land between 15 and 150 (the table above).
- **"Main ten" is now eleven** with return on invested capital, as the addendum asked.
- **Measures past the brief's seventeen:**
  - Return on invested capital is n/a at zero or negative equity.
  - Operating margin change, revenue growth plus free cash flow margin, and cash conversion sit under More filters.
  - Cash conversion is also n/a for banks and insurers, whose operating cash flow swings with deposits.
- **Columns:** sector and year-ended stay as columns after the measures. Headquarters appears when you filter by state.
- **Names are now written by the nightly job,** and the page shows them as stored.
- **Migration 0029 changed the screener's own tables,** adding four columns, rather than only adding new ones as the brief's rule asks. That rule protects live tables, and you approved it by pasting.

## What the brief got wrong

- **"Cash and equivalents minus total debt" isn't one tag.** Companies split debt across several lines, and some count current maturities twice under different tags. Chevron files the same $39.8B under a tag that says "including current maturities" and one that says "noncurrent".
- **"Take the first tag in the list" can be wrong** where a company files a part and the whole under different tags. Illinois Tool Works' cost of revenue is the example.

## Decisions for you

1. **ROIC for companies that file no operating income line (277, including ExxonMobil, Chevron, J&J, Lilly, Merck, Pfizer, IBM, GE and Nike).** The usual stand-in is pretax income plus interest expense. It's close, but it includes non-operating gains. Should I use it, marked as such, or leave these n/a?
2. **ROIC and net cash for companies with no debt line (1,511).** Many are genuinely debt-free, like Ulta. But some carry debt under labels the SEC's data doesn't have, like Ford. I've left them n/a rather than guess zero.
3. **Wise:** treat it as a financial company, so its free cash flow, net cash and ROIC are n/a like a bank's?
4. **Growth from a tiny base** (Arrowhead +23,258%): add a minimum prior-year revenue, say $10 million, below which growth is n/a?

Nothing is merged. This is the one review before anything goes live.

## Appendix: every company whose gross margin is now n/a (70)

| Company | Sector | Was | Why |
|---|---|---|---|
| Amazon.com (AMZN) | Consumer discretionary | 50.3% | cost line covers only part of costs |
| CVS Health (CVS) | Consumer staples | 45.0% | cost line covers only part of costs |
| Chevron (CVX) | Energy | 42.8% | cost line covers only part of costs |
| ConocoPhillips (COP) | Energy | 62.1% | cost line covers only part of costs |
| Republic Services (RSG) | Industrials | 49.4% | cost line covers only part of costs |
| Illinois Tool Works (ITW) | Industrials | 52.9% | cost line covers only part of costs |
| Community Health Systems (CYH) | Health care | 85.1% | cost line covers only part of costs |
| Air Products & Chemicals (APD) | Materials | 31.4% | cost line covers only part of costs |
| Booz Allen Hamilton Holding (BAH) | Industrials | 52.7% | cost line covers only part of costs |
| WEC Energy Group (WEC) | Utilities | 66.7% | cost line covers only part of costs |
| CenterPoint Energy (CNP) | Utilities | 100.0% | cost line covers only part of costs |
| EQT (EQT) | Energy | 82.3% | cost line covers only part of costs |
| Optimum Communications (OPTU) | Communication | 69.3% | cost line covers only part of costs |
| U-Haul Holding (UHAL) | Industrials | 95.9% | cost line covers only part of costs |
| CoreWeave (CRWV) | Technology | 71.7% | cost line covers only part of costs |
| Chord Energy (CHRD) | Energy | 80.0% | cost line covers only part of costs |
| Arcos Dorados (ARCO) | Consumer discretionary | 98.1% | cost line covers only part of costs |
| Liberty Latin America (LILA) | Communication | 78.0% | cost line covers only part of costs |
| Alliant Energy (LNT) | Utilities | 85.7% | cost line covers only part of costs |
| Travel & Leisure (TNL) | Consumer discretionary | 93.2% | cost line covers only part of costs |
| Transocean (RIG) | Energy | 39.3% | cost line covers only part of costs |
| Bloomin' Brands (BLMN) | Consumer discretionary | 70.2% | cost line covers only part of costs |
| JBT Marel (JBTM) | Industrials | 35.1% | cost line covers only part of costs |
| Matador Resources (MTDR) | Energy | 94.4% | cost line covers only part of costs |
| Cracker Barrel Old Country Store (CBRL) | Consumer discretionary | 69.1% | cost line covers only part of costs |
| OGE Energy (OGE) | Utilities | 61.4% | cost line covers only part of costs |
| Life Time Group (LTH) | Consumer discretionary | 47.6% | cost line covers only part of costs |
| Murphy Oil (MUR) | Energy | 100.0% | cost line covers only part of costs |
| Spire (SR) | Utilities | 58.8% | cost line covers only part of costs |
| Northern Oil and Gas (NOG) | Energy | 80.9% | cost line covers only part of costs |
| National Fuel Gas (NFG) | Utilities | 90.6% | cost line covers only part of costs |
| Wendy's (WEN) | Consumer discretionary | 63.6% | cost line covers only part of costs |
| Dave & Buster's Entertainment (PLAY) | Consumer discretionary | 85.7% | cost line covers only part of costs |
| South Bow (SOBO) | Energy | 84.2% | cost line covers only part of costs |
| Suburban Propane Partners (SPH) | Consumer discretionary | 60.6% | cost line covers only part of costs |
| Clearway Energy (CWEN) | Utilities | 62.9% | cost line covers only part of costs |
| Gulfport Energy (GPOR) | Energy | 74.8% | cost line covers only part of costs |
| BJ's Restaurants (BJRI) | Consumer discretionary | 74.7% | cost line covers only part of costs |
| Planet Fitness (PLNT) | Consumer discretionary | 82.6% | cost line covers only part of costs |
| America's Car-Mart (CRMT) | Consumer discretionary | 48.2% | cost line covers only part of costs |
| New Fortress Energy (NFE) | Utilities | 22.1% | utility, no gross profit line |
| Rush Street Interactive (RSI) | Consumer discretionary | 34.6% | cost line covers only part of costs |
| Teekay Tankers (TNK) | Industrials | 66.7% | cost line covers only part of costs |
| Teekay (TK) | Industrials | 66.6% | cost line covers only part of costs |
| Martin Midstream Partners (MMLP) | Energy | 55.5% | cost line covers only part of costs |
| Phoenix Energy One (PHXE-P) | Energy | 77.4% | cost line covers only part of costs |
| Seapeak (SEAL-PA) | Industrials | 98.1% | cost line covers only part of costs |
| Gran Tierra Energy (GTE) | Energy | 55.5% | cost line covers only part of costs |
| Summit Midstream (SMC) | Energy | 73.5% | cost line covers only part of costs |
| Pursuit Attractions and Hospitality (PRSU) | Consumer discretionary | 92.3% | cost line covers only part of costs |
| Cannae (CNNE) | Consumer discretionary | 15.5% | cost line covers only part of costs |
| Biglari (BH-A) | Consumer discretionary | 59.2% | cost line covers only part of costs |
| Liberty Live (LLYVA) | Consumer discretionary | 19.2% | cost line covers only part of costs |
| Nordic American Tankers (NAT) | Industrials | 62.3% | cost line covers only part of costs |
| PrimeEnergy Resources (PNRG) | Energy | 96.7% | cost line covers only part of costs |
| American States Water (AWR) | Utilities | 55.7% | utility, no gross profit line |
| Himalaya Shipping (HSHP) | Industrials | 78.8% | cost line covers only part of costs |
| ImmunityBio (IBRX) | Health care | 99.3% | cost line covers only part of costs |
| Evolution Petroleum (EPM) | Energy | 41.7% | cost line covers only part of costs |
| CTW (CTW) | Technology | 65.5% | cost line covers only part of costs |
| Stabilis Solutions (SLNG) | Utilities | 26.4% | utility, no gross profit line |
| Bioharvest Sciences (BHST) | Health care | 59.3% | cost line covers only part of costs |
| Great Elm Group (GEG) | Technology | 52.3% | cost line covers only part of costs |
| Cadiz (CDZI) | Utilities | 31.6% | utility, no gross profit line |
| United-Guardian (UG) | Consumer staples | 48.8% | cost line covers only part of costs |
| Trump Media & Technology Group (DJT) | Technology | 54.5% | cost line covers only part of costs |
| Charming Medical (MCTA) | Health care | 98.7% | cost line covers only part of costs |
| CitroTech (CITR) | Materials | 22.3% | cost line covers only part of costs |
| Phaos Technology Holdings (POAS) | Technology | 13.1% | cost line covers only part of costs |
| Impact BioMedical (IBO) | Health care | −1,225.0% | cost line covers only part of costs |
