// What changed in a company's risk factors from one 10-K to the next (phase
// nine, stage 7). Pure, so every rule is tested on real filings.
//
// No AI (Eli, 31 October): the changes are shown as they are, in the
// company's own words. Item 1A of each 10-K is split into paragraphs, each
// paragraph of the new one is matched to its closest counterpart in the old
// one by the words they share, and the result sorted into added, removed and
// changed. A changed paragraph shows only the sentences that differ, old and
// new side by side.

import { isPageArtifact, splitSentences } from "@/lib/sec/tenK";

// —— Finding Item 1A ——
// The real section, not the table of contents line: of every "Item 1A. Risk
// Factors" heading, the one followed by the longest run of text before the
// next item. Item 1B (unresolved staff comments) follows it in every 10-K;
// since 2024 Item 1C (cybersecurity) can come first; Item 2 is the backstop.
const ITEM_1A = /(?<=^|\n)item\s*1a\s*[.:\-–—]?\s*risk\s+factors\b/gi;
const AFTER_1A = /(?<=^|\n)item\s*(?:1b|1c|2)\s*[.:\-–—]?\s*(?:unresolved|cybersecurity|properties)\b/gi;

// Shorter than this, what was found is a cross-reference ("see Item 1A in our
// annual report") or a table of contents line, not the section.
const MIN_SECTION_CHARS = 3000;

export function extractRiskFactors(text: string): string | null {
  let best: { start: number; end: number } | null = null;
  for (const m of text.matchAll(ITEM_1A)) {
    const start = m.index ?? 0;
    AFTER_1A.lastIndex = start + m[0].length;
    const next = AFTER_1A.exec(text);
    if (!next) continue;
    if (!best || next.index - start > best.end - best.start) best = { start, end: next.index };
  }
  if (!best) return null;
  const section = text.slice(best.start, best.end).trim();
  return section.length >= MIN_SECTION_CHARS ? section : null;
}

// —— Paragraphs ——
// One per block of text, a sentence that a page break cut in two rejoined,
// page numbers and running footers dropped. Category headings ("Risks
// Related to Our Industry") are dropped too: short and not a sentence. Each
// risk's own title is a full sentence and stays, as its own paragraph.
const MIN_PARAGRAPH_CHARS = 60;

// A leading bullet is layout, not text: in the filing it usually sits in a
// cell of its own, so a link quoting it wouldn't find the sentence.
const LEADING_BULLET = /^[•◦▪●○■·–-]\s*/;

export function riskParagraphs(section: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const raw of section.split("\n").slice(1)) {
    const trimmed = raw.trim();
    // A bulleted line is a list item of its own, even when it starts in lower
    // case after an item ending "; and": never the second half of a sentence a
    // page break cut.
    const bulleted = LEADING_BULLET.test(trimmed);
    const line = trimmed.replace(LEADING_BULLET, "");
    if (!line || isPageArtifact(line)) continue;
    if (current && !bulleted && !/[.!?:;]["”’)]?$/.test(current) && /^[a-z(]/.test(line)) {
      current += ` ${line}`;
      continue;
    }
    if (current.length >= MIN_PARAGRAPH_CHARS) out.push(current);
    current = line;
  }
  if (current.length >= MIN_PARAGRAPH_CHARS) out.push(current);
  return out;
}

// —— Comparing ——
// Numbers and years are set aside before comparing: a paragraph whose only
// change is "fiscal year 2025" becoming "fiscal year 2026" hasn't changed.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"’'`]/g, "")
    .replace(/\$?\d[\d,.]*%?/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim();
}

type Vector = Map<string, number>;

// Words and pairs of words, so a reworded paragraph scores lower than one
// whose words merely moved.
function termsOf(text: string): Vector {
  const words = normalize(text).split(" ").filter((w) => w.length > 1);
  const v: Vector = new Map();
  const add = (k: string) => v.set(k, (v.get(k) ?? 0) + 1);
  for (let i = 0; i < words.length; i++) {
    add(words[i]);
    if (i > 0) add(`${words[i - 1]} ${words[i]}`);
  }
  return v;
}

// Each term weighted by how rare it is across both years' paragraphs. Without
// this, Apple's two paragraphs on unrelated risks matched because both said
// "the Company" a dozen times; a word every paragraph uses tells nothing
// about which risk a paragraph is.
function rarity(paragraphs: string[]): (term: string) => number {
  const df = new Map<string, number>();
  for (const p of paragraphs) for (const t of termsOf(p).keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = paragraphs.length;
  return (t) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
}

function weighted(text: string, weight: (t: string) => number): { v: Vector; n: number } {
  const v: Vector = new Map();
  for (const [t, tf] of termsOf(text)) v.set(t, tf * weight(t));
  return { v, n: norm(v) };
}

function norm(v: Vector): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

// Plain similarity of two texts, every word weighted alike.
export function similarity(a: string, b: string): number {
  const va = termsOf(a);
  const vb = termsOf(b);
  return cosine(va, norm(va), vb, norm(vb));
}

function cosine(a: Vector, na: number, b: Vector, nb: number): number {
  if (!na || !nb) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) {
    const y = large.get(k);
    if (y) dot += x * y;
  }
  return dot / (na * nb);
}

// Below this, two paragraphs aren't the same risk reworded: the new one is
// added and the old one removed. On rarity-weighted terms.
export const SAME_RISK = 0.45;
// Two sentences this alike are one sentence reworded, not one taken out and
// another put in.
export const SAME_SENTENCE = 0.6;

export type SentencePair = { old: string | null; new: string | null };

export type ParagraphChange = {
  // "changed": sentences were added or taken out. "reworded": the same
  // sentences, in different words.
  kind: "changed" | "reworded";
  // Only the sentences that differ, side by side: a reworded sentence pairs
  // its old and new versions; an added or removed one stands alone.
  pairs: SentencePair[];
};

export type RiskComparison = {
  counts: {
    newParagraphs: number;
    oldParagraphs: number;
    added: number;
    removed: number;
    changed: number;
    reworded: number;
    unchanged: number;
  };
  // The paragraphs themselves; the page shows each one's first sentence.
  added: string[];
  removed: string[];
  changes: ParagraphChange[];
};

export function firstSentence(p: string): string {
  return splitSentences(p)[0] ?? p;
}

// One-to-one, the most alike first, above a threshold.
function pairUp(
  left: { v: Vector; n: number }[],
  right: { v: Vector; n: number }[],
  threshold: number,
  taken: { left: boolean[]; right: number[] },
): void {
  const candidates: { i: number; j: number; s: number }[] = [];
  right.forEach((r, j) => {
    if (taken.right[j] >= 0) return;
    left.forEach((l, i) => {
      if (taken.left[i]) return;
      const s = cosine(l.v, l.n, r.v, r.n);
      if (s >= threshold) candidates.push({ i, j, s });
    });
  });
  candidates.sort((a, b) => b.s - a.s);
  for (const c of candidates) {
    if (taken.right[c.j] >= 0 || taken.left[c.i]) continue;
    taken.right[c.j] = c.i;
    taken.left[c.i] = true;
  }
}

export function compareRiskFactors(oldParagraphs: string[], newParagraphs: string[]): RiskComparison {
  const weight = rarity([...oldParagraphs, ...newParagraphs]);
  const oldV = oldParagraphs.map((p) => ({ ...weighted(p, weight), key: normalize(p) }));
  const newV = newParagraphs.map((p) => ({ ...weighted(p, weight), key: normalize(p) }));

  // Identical paragraphs (numbers aside) pair off first, exactly; the rest by
  // similarity.
  const taken = { left: new Array<boolean>(oldParagraphs.length).fill(false), right: new Array<number>(newParagraphs.length).fill(-1) };
  const byKey = new Map<string, number[]>();
  oldV.forEach((o, i) => byKey.set(o.key, [...(byKey.get(o.key) ?? []), i]));
  newV.forEach((nv, j) => {
    const free = (byKey.get(nv.key) ?? []).find((i) => !taken.left[i]);
    if (free != null) {
      taken.right[j] = free;
      taken.left[free] = true;
    }
  });
  pairUp(oldV, newV, SAME_RISK, taken);

  const added: string[] = [];
  const changes: ParagraphChange[] = [];
  let unchanged = 0;
  newParagraphs.forEach((p, j) => {
    const i = taken.right[j];
    if (i < 0) {
      added.push(p);
      return;
    }
    if (oldV[i].key === newV[j].key) {
      unchanged++;
      return;
    }
    // Sentence by sentence, numbers aside: what's only in the old, and only
    // in the new. Then the two lists paired where a sentence was reworded.
    const oldS = splitSentences(oldParagraphs[i]);
    const newS = splitSentences(p);
    const oldKeys = new Set(oldS.map(normalize));
    const newKeys = new Set(newS.map(normalize));
    const gone = oldS.filter((s) => !newKeys.has(normalize(s)));
    const came = newS.filter((s) => !oldKeys.has(normalize(s)));
    if (gone.length === 0 && came.length === 0) {
      unchanged++;
      return;
    }
    // Plain word overlap here, not rarity: these are sentences of one risk
    // already matched, and "would" turning into "could" is exactly the kind
    // of rare word that would otherwise push a reworded sentence apart.
    const plain = (s: string) => {
      const v = termsOf(s);
      return { v, n: norm(v) };
    };
    const goneV = gone.map(plain);
    const cameV = came.map(plain);
    const st = { left: new Array<boolean>(gone.length).fill(false), right: new Array<number>(came.length).fill(-1) };
    pairUp(goneV, cameV, SAME_SENTENCE, st);
    const pairs: SentencePair[] = [];
    came.forEach((s, k) => pairs.push({ old: st.right[k] >= 0 ? gone[st.right[k]] : null, new: s }));
    gone.forEach((s, k) => {
      if (!st.left[k]) pairs.push({ old: s, new: null });
    });
    const kind = pairs.some((x) => x.old == null || x.new == null) ? "changed" : "reworded";
    changes.push({ kind, pairs });
  });
  const removed = oldParagraphs.filter((_, i) => !taken.left[i]);

  return {
    counts: {
      newParagraphs: newParagraphs.length,
      oldParagraphs: oldParagraphs.length,
      added: added.length,
      removed: removed.length,
      changed: changes.filter((c) => c.kind === "changed").length,
      reworded: changes.filter((c) => c.kind === "reworded").length,
      unchanged,
    },
    added,
    removed,
    changes,
  };
}

// —— Linking to the place in the filing ——
// A text fragment ("#:~:text=") opens the filing scrolled to, and
// highlighting, the sentence itself. Supported by Chrome, Edge, Safari and
// Firefox; elsewhere the link opens the filing at the top.
//
// Given by its first and last words, not its opening alone: 10-Ks repeat
// their openings ("The Company's business, reputation, results of
// operations...") dozens of times, and an opening alone would jump to the
// first of them. Hyphens and commas mean something in the syntax, so they're
// escaped; encodeURIComponent leaves hyphens alone.
const FRAGMENT_WORDS = 6;

export function textFragment(sentence: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D");
  const words = sentence.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= FRAGMENT_WORDS * 2) return `#:~:text=${enc(words.join(" "))}`;
  return `#:~:text=${enc(words.slice(0, FRAGMENT_WORDS).join(" "))},${enc(words.slice(-FRAGMENT_WORDS).join(" "))}`;
}
