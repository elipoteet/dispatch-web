// Reading a 10-K's own text. Pure functions, no I/O, so they are tested against
// real filings saved as fixtures.
//
// Used for one thing in stage 2: finding Item 1 ("Business"), the company's
// own description of what it does, which the Overview summarises once into two
// plain sentences. Stage 7's "what changed" diff will reuse htmlToText for
// Item 1A.
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
