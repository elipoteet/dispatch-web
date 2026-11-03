// Reading a 10-K's own text. Pure functions, no I/O, so they are tested against
// real filings saved as fixtures.
//
// Used for one thing in stage 2: finding Item 1 ("Business") and quoting the
// opening of the company's own description of what it does, for the
// Overview's "In its own words" line. Stage 7's "what changed" diff will reuse
// htmlToText for Item 1A.
//
// 10-K documents are inline-XBRL HTML, and large: NVIDIA's fiscal 2026 10-K is
// 2.0MB, JPMorgan's 2025 one 12.9MB, because the machine-readable tagging rides
// along inside the page. Only the visible text matters here.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  reg: "®",
  trade: "™",
  copy: "©",
  bull: "•",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      // Non-breaking space becomes a plain one so headings match on \s.
      return code === 160 ? " " : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

// Visible text, one block element per line. Tables keep a row per line so a
// table of contents entry ("Item 1. Business ... 4") stays on one line.
export function htmlToText(html: string): string {
  const text = html
    // The hidden inline-XBRL header: contexts, units, hidden facts. Can be most
    // of the file and none of it is prose.
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t  ​]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// A risk's heading and its first paragraph can share one block: a bold run,
// then plain text. Chevron's 2025 10-K reads
//   <div><span style="…font-weight:700…">…may present business, compliance,
//   and reputational risks </span><span style="…font-weight:400…">The company
//   is increasingly utilizing…
// and as text the two run together into one "sentence" ("…reputational risks
// The company is…"), since the heading has no full stop. The words alone can't
// tell a heading from a capitalised word mid-sentence; the markup can. So a
// line break goes after a block's opening bold run when plain text follows in
// the same block. A bold run inside a sentence (not at the block's start), or
// a block that is bold throughout, is left as it is. For Item 1A only (see
// lib/sec/filingChanges.ts): the business section's quote is read as before.
const BOLD_OPEN = String.raw`(?:<(?:b|strong)\b[^>]*>|<span\b[^>]*font-weight:\s*(?:bold|[6-9]00)\b[^>]*>)`;
const LEADING_BOLD_RUN = new RegExp(
  String.raw`(<(?:p|div)\b[^>]*>\s*` +
    // The heading: one bold run of real length, then any bold runs that carry
    // on from it (Chevron's sometimes ends with a bold space of its own).
    String.raw`${BOLD_OPEN}[^<]{15,}<\/(?:b|strong|span)>(?:\s*${BOLD_OPEN}[^<]*<\/(?:b|strong|span)>)*)` +
    // Then plain text in the same block, past any spans holding only a space:
    // a run that isn't bold, or bare text.
    String.raw`(?=(?:\s*<span\b[^>]*>\s*<\/span>)*\s*(?:<span\b(?![^>]*font-weight:\s*(?:bold|[6-9]00)\b)[^>]*>\s*[^<\s]|[^<\s]))`,
  "gi",
);

export function breakAfterLeadingBold(html: string): string {
  return html.replace(LEADING_BOLD_RUN, "$1<br>");
}

// "Item 1. Business" at the start of a line, tolerating the punctuation and
// spacing variations filers use ("ITEM 1.", "Item 1:", "Item 1 -", a line break
// between the number and the word).
const ITEM_1 = /(?<=^|\n)item\s*1\s*[.:\-–—]?\s*business\b/gi;
const ITEM_1A = /(?<=^|\n)item\s*1a\s*[.:\-–—]?\s*risk\s+factors\b/gi;

// The shortest Item 1 worth summarising. Below this, what was found is a table
// of contents line or a cross-reference stub, not the section itself.
const MIN_SECTION_CHARS = 400;

// Item 1 of a 10-K, as plain text, or null when it cannot be found reliably.
//
// Every 10-K mentions "Item 1. Business" at least twice: once in the table of
// contents and once as the real heading. The table of contents entry is
// followed almost immediately by "Item 1A. Risk Factors", so of every candidate
// heading, the one followed by the LONGEST run of text before Item 1A is the
// section itself. Returns null rather than guessing when nothing qualifies.
export function extractBusinessSection(text: string): string | null {
  const starts = [...text.matchAll(ITEM_1)].map((m) => m.index ?? 0);
  if (starts.length === 0) return null;

  let best: { start: number; end: number } | null = null;
  for (const start of starts) {
    ITEM_1A.lastIndex = start;
    const next = ITEM_1A.exec(text);
    if (!next) continue;
    const end = next.index;
    if (!best || end - start > best.end - best.start) best = { start, end };
  }
  if (!best) return null;

  const section = text.slice(best.start, best.end).trim();
  return section.length >= MIN_SECTION_CHARS ? section : null;
}

// —— "In its own words" ——
// The first sentence or two of Item 1 in which the company says what it does,
// quoted. Free, and straight from the source: the Overview's description,
// in place of an AI summary (Eli, 31 October 2026: no paid AI).
//
// Item 1 rarely opens with that sentence. Before it, filers put headings
// ("Our Company", "General"), a paragraph defining "we" and "the Company",
// or a forward-looking-statements warning. And a page break can land in the
// middle of the sentence itself, leaving the page footer between its halves
// (Pfizer: "...distribution of / Pfizer Inc. 2025 Form 10-K / 3 /
// biopharmaceutical products worldwide."). Each rule below came from one of
// seventeen real 10-Ks, October 2026.

// Paragraphs that are legal preamble, not description.
const BOILERPLATE =
  /forward-looking|unless the context|as used (?:in|herein)|\bthe terms?\b[^.]{0,160}\b(?:refers?|means?|includes?)\b|references to [“"]|when we use the terms|incorporated (?:herein )?by reference|table of contents/i;

const SENTENCE_END = /[.!?]["”’)]?$/;

// A heading is a short line that doesn't end like a sentence.
function isHeading(line: string): boolean {
  return line.length < 90 && !/[.!?:;]["”’)]?$/.test(line);
}

// Page furniture: a bare page number, a running footer naming the form, or a
// running header naming the part (JPMorgan's "Part I", "Parts I and II").
export function isPageArtifact(line: string): boolean {
  return (
    /^\d{1,3}$/.test(line) ||
    (line.length < 80 && /form 10-k/i.test(line)) ||
    /^table of contents$/i.test(line) ||
    /^parts? [ivx]+(?: and [ivx]+)?$/i.test(line)
  );
}

// Words whose trailing period doesn't end a sentence.
const ABBREVIATIONS = new Set(["inc", "corp", "co", "ltd", "llc", "no", "st", "mr", "mrs", "ms", "dr", "jr", "sr", "vs", "etc", "approx", "dept"]);

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]["”’)]?(?=\s+[A-Z“"(])/g)) {
    const end = (m.index ?? 0) + m[0].length;
    const before = text.slice(start, (m.index ?? 0) + 1).match(/([A-Za-z.]+)\.$/)?.[1] ?? "";
    // "Inc.", "U.S.", "N.A.", a single initial: not the end of a sentence.
    if (ABBREVIATIONS.has(before.toLowerCase()) || before.includes(".") || /^[A-Z]$/.test(before)) continue;
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

// Light trimming, so the quote reads as a sentence: defined-term asides
// ("(the “Company”)", "(“AI”)", "(Costco or the Company)"), footnote markers
// glued to a word ("Chevron Corporation1,"), and trademark symbols.
function trimQuote(text: string): string {
  return text
    .replace(/\s*\([^()]*(?:[“”"]|\bthe (?:Company|Firm|Registrant)\b)[^()]*\)/g, "")
    .replace(/([a-z])\d(?=[,.;\s])/g, "$1")
    .replace(/[®™℠]/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_QUOTE_CHARS = 450;

const HOUSEKEEPING = /fiscal year (?:is|ends|consists)|52- or 53-week|52\/53-week|incorporated (?:in|under)/i;

export function ownWordsExcerpt(section: string): string | null {
  // Rebuild paragraphs, rejoining a sentence a page break cut in two.
  const paragraphs: string[] = [];
  let current = "";
  for (const raw of section.split("\n").slice(1)) {
    const line = raw.trim();
    if (!line || isPageArtifact(line)) continue;
    if (current && !SENTENCE_END.test(current) && /^[a-z]/.test(line)) {
      current += ` ${line}`;
      continue;
    }
    if (current) paragraphs.push(current);
    current = isHeading(line) ? "" : line;
  }
  if (current) paragraphs.push(current);

  for (const paragraph of paragraphs) {
    if (paragraph.length < 60 || BOILERPLATE.test(paragraph)) continue;
    const sentences = splitSentences(trimQuote(paragraph));
    if (sentences.length === 0) continue;
    let quote = sentences[0];
    // A short opening line ("Pfizer Inc. is a research-based, global
    // biopharmaceutical company.") reads better with the sentence after it.
    // Not when that sentence is calendar housekeeping (Apple: "The Company's
    // fiscal year is the 52- or 53-week period that ends on the last Saturday
    // of September.").
    if (
      quote.length < 160 &&
      sentences[1] &&
      !HOUSEKEEPING.test(sentences[1]) &&
      quote.length + 1 + sentences[1].length <= MAX_QUOTE_CHARS
    ) {
      quote += ` ${sentences[1]}`;
    }
    if (quote.length > MAX_QUOTE_CHARS) {
      const cut = quote.slice(0, MAX_QUOTE_CHARS);
      const at = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf("; "));
      quote = `${cut.slice(0, at > 200 ? at : cut.lastIndexOf(" "))}…`;
    }
    return quote;
  }
  return null;
}
