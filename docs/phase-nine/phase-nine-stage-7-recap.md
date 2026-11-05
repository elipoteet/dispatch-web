# Phase nine, Stage 7 recap: Filings and what changed

Written 2 November 2026. Branch `feat/research-site`. Not on the live site until Eli signs off. Migration `0024_filing_changes.sql` was pasted on 2 November.

## What a student now sees

A Filings tab after Insiders, at `/research/{ticker}/filings`, with two parts.

**What changed in the risk factors.** The company's latest 10-K set against the one before, in one sentence first. NVIDIA, for example: "annual report filed February 25, 2026, against the one filed February 26, 2025: 26 risk paragraphs added, 11 taken out, 13 with sentences added or removed, and 27 reworded. 137 of 203 are unchanged, apart from dates and figures." Then the changes themselves, in the company's own words:

- **Added**: each new paragraph's first sentence. NVIDIA's include its Groq licence, the OpenAI partnership, the H20 and H200 China export licences, power and capital for datacenters, and U.S. manufacturing.
- **Taken out**: each removed paragraph's first sentence, linked to last year's report.
- **Sentences added or removed**: last year beside this year, only the sentences that differ.
- **Reworded**: the same sentences in different words, side by side, folded away by default. Coca-Cola: "intensified inflation throughout 2024" became "high rates of inflation throughout 2025".

**Every sentence links to its own place in the filing.** The browser opens the 10-K scrolled to that sentence and highlights it.

**Filings with the SEC.** Every recent filing in plain words: "Annual report", "Quarterly report", "Insider trade report". 8-Ks are named by what they report, from their item numbers: "Results of operations", "Director or officer change", "New material agreement; New debt or obligation". Filters cover annual and quarterly reports, 8-Ks, Form 4s and proxy statements. Each filing links to EDGAR, and there's a link to the full EDGAR listing.

## Verified

- **Tried on five real pairs of 10-Ks before building the page:**

  | Company | Added | Taken out | Changed | Reworded | Unchanged |
  |---|---|---|---|---|---|
  | NVIDIA | 26 | 11 | 13 | 27 | 137 |
  | Coca-Cola | 2 | 1 | 7 | 20 | 70 |
  | Culp | 10 | 4 | 15 | 20 | 36 |
  | Apple | 7 | 16 | 30 | 23 | 40 |
  | JPMorgan | 124 | 172 | 64 | 171 | 90 |

  JPMorgan rewrote its risk factors for 2025, adding a definitions section, and the page shows it as the rewrite it was.
- **The sentence links.** Checked in Chromium on a saved copy of NVIDIA's 10-K: the link to the Groq sentence opened the filing with that sentence in the middle of the screen. The SEC refuses automated browsers, so this couldn't be checked against sec.gov itself; a person's browser is served normally.
- **Speed.** The comparison takes under a second, even for JPMorgan's 13MB reports. A first visit says the comparison is being prepared, and the result is there on the next.
- **Tests:** 316 pass, 26 of them new. They include NVIDIA's real Item 1A from both years, checking that the Groq and capital-and-energy paragraphs read as added and the "AI Diffusion" rule as taken out. `tsc` and `next build` are clean, and lint adds nothing new.
- **Banned words.** No matches on the Filings pages of NVIDIA, Coca-Cola, Culp and JPMorgan, outside the quoted risk-factor sentences. Inside them, NVIDIA's own words use "sell" eight times ("our ability to sell"). Those are the company's sentences, quoted and linked; the brief exempts posts the same way.
- **Addresses.** `/research/NVDA/filings` answers 308; SPY and an unknown ticker give a 404.
- **Screenshots** at 1280px and 390px, in light and dark mode. Nothing is wider than the screen, and the browser reported no errors. On a phone the two years stack, each labelled.
- **Twelve Data:** this tab makes no requests.

## How it works

- **Finding the reports.** EDGAR's company feed lists a company's 10-Ks in one small request. The submissions file can't always do it: JPMorgan's recent list stops short of last year's 10-K, behind thousands of prospectus filings.
- **Reading Item 1A.** From the real "Item 1A. Risk Factors" heading, not the table of contents, to Item 1B, 1C or 2.
  - The text is split into paragraphs, with sentences cut by page breaks rejoined.
  - Page furniture ("31", "Parts I and II"), category headings and leading bullets are dropped; bulleted items stay apart.
- **Matching paragraphs.**
  - Identical ones (dates and figures aside) pair first.
  - The rest pair by the words they share, each word weighted by how rare it is across both reports. Without the weighting, Apple's App Store paragraph matched an unrelated one because both said "the Company" a dozen times.
  - Unmatched new paragraphs are added; unmatched old ones taken out.
- **Inside a matched paragraph,** sentences are compared the same way. A sentence that is new or gone makes it "changed"; the same sentences in other words make it "reworded".
- **Storage.** The result is stored once per 10-K (`filing_changes`), with a rules version, so a change to the rules redoes old comparisons on the next visit.

## What deviated from the brief

- **Worked out on first view as well as by the cron.** The brief said the cron should generate each comparison. A visitor would then wait up to a day, so the first visit to a company's Filings tab starts it, after the page has been sent. The daily cron, within 15 of its 60 seconds, compares a new 10-K for any company whose tab has been opened. Either way it happens once per filing, and only for opened companies.
- **No summaries,** per the 31 October revision: the changes are the company's own sentences.
- **Two kinds of change, not one.** "Materially changed" became "sentences added or removed" (shown open) and "reworded" (folded away). Telling a real addition from a tidy-up by rules alone isn't reliable, so both are shown, honestly labelled.
- **10-Ks only.** 20-F filers aren't covered yet, and the page says so.

## Still to confirm

- **On the Vercel preview,** after the SEC contact email reaches Preview builds.
- **Intraday delay**, carried over from Stage 3.
