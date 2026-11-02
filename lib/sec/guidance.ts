// A company's own revenue outlook for next quarter, read from its earnings
// release by rules (phase nine, stage 5). Pure, so every rule is tested on
// sentences quoted from real releases.
//
// No AI (Eli, 31 October). So this matches only the shapes companies actually
// use, checked on the latest releases of fifty large companies in November
// 2026, and returns nothing for anything else:
//
//   NVIDIA   "Revenue is expected to be $108.0 billion, plus or minus 2%."
//   AMD      "...expects revenue to be approximately $13 billion, plus or minus $300 million."
//   Amazon   "Net sales are expected to be between $240.0 billion and $247.0 billion..."
//   Meta     "We expect fourth quarter 2026 total revenue to be in the range of $73-76 billion."
//   Broadcom "Fourth quarter fiscal year 2026 revenue guidance of approximately $34.8 billion"
//   Micron   a table row: "Revenue $61.5 billion ± $1.5 billion" under "FQ1-27 ... Outlook"
//
// About a quarter of those fifty state one at all; most give guidance on the
// call, as a growth percentage, or not at all. A blank is the honest answer
// for them.
//
// What it refuses, on purpose:
//   - a segment's revenue ("AI semiconductor revenue", "QCT revenues"): only
//     total, net or consolidated revenue, or net sales;
//   - the full year ("For 2026, the Company now expects net revenue..."): the
//     bars are quarterly;
//   - results ("Q3 revenue grew 12% ... to $12.9B"): a past-tense verb between
//     the word and the figure, or no outlook word nearby;
//   - a quarter it can't name: the quarter must be in the sentence or in the
//     heading just above it.

export type RevenueGuidance = {
  low: number;
  high: number;
  mid: number;
  // The quarter the text names: 1 to 4.
  quarter: 1 | 2 | 3 | 4;
  // The sentence or table row, as written.
  quote: string;
  // The heading above it that named the quarter, when the quote doesn't.
  heading: string | null;
};

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const UNIT = String.raw`(billion|million|bn|[BM](?![a-z]))`;
const PLUS_MINUS = new RegExp(
  String.raw`^\$\s?${NUM}\s*${UNIT}\s*,?\s*(?:plus or minus|\+\s*/\s*-|±)\s*(?:\$\s?${NUM}\s*${UNIT}|${NUM}\s*%)`,
  "i",
);
const RANGE = new RegExp(String.raw`^\$\s?${NUM}\s*${UNIT}?\s*(?:-|–|—|to|and)\s*\$?\s?${NUM}\s*${UNIT}`, "i");
const POINT = new RegExp(String.raw`^\$\s?${NUM}\s*${UNIT}`, "i");

// Outlook words, allowing a footnote number stuck to the end (Qualcomm's
// table is headed "Estimates1").
const OUTLOOK = /\b(expects?|expected|expecting|anticipat\w*|forecast\w*|outlook|guidance|guide|projects?|projected|estimates?)(?=\b|\d)/i;
const FULL_YEAR = /\b(full[\s-]year|annual|for (?:the )?(?:fiscal |calendar )?year\b|for (?:fiscal |calendar )?20\d\d\b)/i;
const QUARTER = /\b(first|second|third|fourth)[\s-]+quarter\b|\bF?Q([1-4])\b|\bquarter\s+([1-4])\b/i;
const YEAR_PERIOD = /\b(FY\s?'?\d{2,4}|fiscal(?: year)?\s+20\d\d|20\d\d)\b/i;
// Broadcom's "...the outlook for the fourth quarter of fiscal year 2026, ending
// November 1, 2026, is expected to be as follows:" is about the longest real
// heading seen, at 150 characters.
const MAX_HEADING = 160;
// Between the word "revenue" and its figure: a verb in the past tense means a
// result, and another measure means the figure belongs to that instead.
// A semicolon means the figure is in another clause; "by" means it's a change
// ("Raises FY27 revenue guidance by $200M"), not a level.
const NOT_GUIDANCE_GAP =
  /;|\b(by|was|were|grew|grow\w*|increased|decreased|declined|rose|fell|totall?ed|reached|came|ended|compared|included|includes|including|reflects?|reflected|up|down|income|margins?|earnings|eps|profit|expenses?|cash|operating)\b/i;
// Before the figure: words that mark a result being reported.
const RESULT_CONTEXT = /\b(results|reported|reports|three months ended|quarter ended)\b/i;
// Before "revenue", after any total / net / consolidated and any naming of the
// period ("fourth quarter fiscal year 2026"), may come only the start of the
// line or a verb or preposition of looking ahead. Anything else is a segment's
// name ("Commercial Airplanes third quarter revenue") or a report of the past
// ("Cisco reported fourth quarter revenue").
const QUALIFIERS = /^(total|net|consolidated)$/i;
const PERIOD_WORDS = /^(quarter|[a-z]+-quarter|first|second|third|fourth|f?q[1-4](?:-\d{2,4})?|fy(?:\d{2,4})?|20\d\d|fiscal|year)$/i;
const ALLOWED_BEFORE =
  /^(|expects?|expected|forecasting|forecasts?|projects?|projected|anticipates?|of|for|our|its|the|that|in|guidance|outlook|initiates?|provides?|issues?|raises?|sets?|reaffirms?|updates?|maintains?|gives?)$/i;
// A table cell holding only the label, with its figure on the next line
// (Micron's outlook table).
const LABEL_ONLY = /^(?:total |net |consolidated )?(?:revenues?|net sales)$/i;
const ORDINALS: Record<string, 1 | 2 | 3 | 4> = { first: 1, second: 2, third: 3, fourth: 4 };

function scale(unit: string): number {
  return /^(b|billion|bn)$/i.test(unit) ? 1e9 : 1e6;
}

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

// The figure starting at a "$": a point, a range, or a figure plus or minus
// an amount or a percentage.
export function parseAmount(text: string): { low: number; high: number; mid: number } | null {
  let m = text.match(PLUS_MINUS);
  if (m) {
    const mid = num(m[1]) * scale(m[2]);
    const spread = m[3] != null ? num(m[3]) * scale(m[4]) : (mid * num(m[5])) / 100;
    return { low: mid - spread, high: mid + spread, mid };
  }
  m = text.match(RANGE);
  if (m) {
    const unit = scale(m[4]);
    const low = num(m[1]) * (m[2] ? scale(m[2]) : unit);
    const high = num(m[3]) * unit;
    if (!(low > 0 && high >= low)) return null;
    return { low, high, mid: (low + high) / 2 };
  }
  m = text.match(POINT);
  if (m) {
    const v = num(m[1]) * scale(m[2]);
    return { low: v, high: v, mid: v };
  }
  return null;
}

function quarterIn(text: string): 1 | 2 | 3 | 4 | null {
  const m = text.match(QUARTER);
  if (!m) return null;
  if (m[1]) return ORDINALS[m[1].toLowerCase()];
  return Number(m[2] ?? m[3]) as 1 | 2 | 3 | 4;
}

const BULLETS = /^[\s•◦▪●○■\-–*"“”'’]+/;

function cleanToken(t: string): string {
  return t.replace(/^[^\w$-]+|[^\w-]+$/g, "").replace(/['’]s$/i, "");
}

// Where, in a sentence, a total-revenue figure starts. -1 if none.
function revenueFigureAt(sentence: string): number {
  for (const m of sentence.matchAll(/\b(revenues?|sales)\b/gi)) {
    const before = sentence.slice(0, m.index).trim().split(/\s+/).map(cleanToken).filter(Boolean);
    let k = before.length - 1;
    if (/^sales$/i.test(m[1])) {
      if (!/^net$/i.test(before[k] ?? "")) continue;
      k--;
    }
    while (k >= 0 && QUALIFIERS.test(before[k])) k--;
    while (k >= 0 && PERIOD_WORDS.test(before[k])) k--;
    if (!ALLOWED_BEFORE.test(before[k] ?? "")) continue;

    const after = m.index! + m[0].length;
    const dollar = sentence.indexOf("$", after);
    if (dollar < 0 || dollar - after > 140) continue;
    if (NOT_GUIDANCE_GAP.test(sentence.slice(after, dollar))) continue;
    if (RESULT_CONTEXT.test(sentence.slice(0, dollar))) continue;
    return dollar;
  }
  return -1;
}

// Every quarterly revenue outlook in a release's text (from htmlToText), in
// document order. The caller picks the one for the quarter it expects (see
// pickGuidance).
export function findRevenueGuidance(text: string): RevenueGuidance[] {
  const lines = text.split("\n").map((l) => l.replace(BULLETS, "").trim());
  for (let i = 0; i < lines.length - 1; i++) {
    if (LABEL_ONLY.test(lines[i]) && lines[i + 1].startsWith("$")) {
      lines[i] = `${lines[i]} ${lines[i + 1]}`;
      lines[i + 1] = "";
    }
  }
  const found: RevenueGuidance[] = [];

  lines.forEach((line, i) => {
    const sentences = line.split(/(?<=[.;!?])\s+(?=[A-Z"“(])/);
    for (const raw of sentences) {
      const sentence = raw.replace(BULLETS, "").trim();
      const at = revenueFigureAt(sentence);
      if (at < 0) continue;
      const amount = parseAmount(sentence.slice(at));
      if (!amount) continue;
      if (FULL_YEAR.test(sentence)) continue;

      // The quarter: named in the sentence before the figure, or else in the
      // nearest heading within four lines above that speaks of an outlook.
      // Only before the figure, because what follows it is often a comparison:
      // Amazon's "...between $240.0 billion and $247.0 billion ... compared
      // with fourth quarter 2025".
      let quarter = quarterIn(sentence.slice(0, at));
      // A year named before the figure with no quarter: an annual outlook
      // ("...$7.5 billion expected in FY 2027").
      if (quarter == null && YEAR_PERIOD.test(sentence.slice(0, at))) continue;
      let heading: string | null = null;
      if (quarter == null || !OUTLOOK.test(sentence)) {
        // Up the page: an annual heading ends the search; an outlook heading
        // is noted; a line naming a quarter settles it, provided it, or a
        // heading below it, speaks of an outlook ("Third Quarter Results"
        // doesn't, so a results table is never taken for guidance).
        let outlookSeen = OUTLOOK.test(sentence);
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const above = lines[j];
          // Headings are short. A long line is prose, and the quarter a
          // paragraph mentions ("...the Q3 acquired IPR&D charges", Lilly's)
          // isn't the period of the figure below it.
          if (!above || above.length > MAX_HEADING) continue;
          if (FULL_YEAR.test(above) || RESULT_CONTEXT.test(above)) break;
          const named = quarterIn(above);
          // An outlook heading naming a year and no quarter ("FY 2027
          // Guidance:", Cisco's) governs an annual block: stop, or the
          // quarterly heading above it would label an annual figure.
          if (named == null && OUTLOOK.test(above) && YEAR_PERIOD.test(above)) break;
          if (OUTLOOK.test(above)) outlookSeen = true;
          if (named != null || (OUTLOOK.test(above) && quarter != null)) {
            if (OUTLOOK.test(above) || outlookSeen) {
              heading = above;
              quarter ??= named;
            }
            break;
          }
        }
        if (!heading && !OUTLOOK.test(sentence)) continue;
      }
      if (quarter == null) continue;
      found.push({ ...amount, quarter, quote: sentence, heading });
    }
  });
  return found;
}

// The outlook for the quarter after the one a release reports, if the release
// gives one. Checked against the quarter just reported: a figure under half
// or over double it is not a quarter's revenue (a full year that slipped past
// the wording, or a unit read wrong), so it is not used.
export function pickGuidance(
  candidates: RevenueGuidance[],
  expect: { quarter: 1 | 2 | 3 | 4; lastRevenue: number | null },
): RevenueGuidance | null {
  return (
    candidates.find((c) => {
      if (c.quarter !== expect.quarter) return false;
      if (expect.lastRevenue == null || expect.lastRevenue <= 0) return true;
      const ratio = c.mid / expect.lastRevenue;
      return ratio >= 0.5 && ratio <= 2;
    }) ?? null
  );
}
