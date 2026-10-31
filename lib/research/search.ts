// Ticker and company-name search over the SEC's ticker file (~10,400 listed
// symbols, cached for a day by lib/sec/client.ts). Pure, so the ranking is
// unit-tested.

import { titleCaseName } from "@/lib/research/format";

export type SearchEntry = { symbol: string; name: string };
export type SearchResult = SearchEntry;

function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Best first: the exact ticker, then tickers starting with the query, then
// names starting with it, then names with a word starting with it, then any
// name containing it. Within a tier, the SEC file's own order wins, and that
// file lists the largest companies first, so "apple" finds Apple Inc. before
// a small company with Apple in its name.
export function searchCompanies(entries: SearchEntry[], query: string, limit = 8): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const symbolQuery = q.toUpperCase().replace(/^\$/, "");
  const nameQuery = normalizeName(q);
  const tiers: SearchEntry[][] = [[], [], [], [], []];

  for (const entry of entries) {
    const symbol = entry.symbol.toUpperCase();
    // The SEC writes share classes with a hyphen; people type a dot.
    const symbolAlt = symbol.replace(/-/g, ".");
    if (symbol === symbolQuery || symbolAlt === symbolQuery) {
      tiers[0].push(entry);
      continue;
    }
    if (symbolQuery.length >= 1 && (symbol.startsWith(symbolQuery) || symbolAlt.startsWith(symbolQuery))) {
      tiers[1].push(entry);
      continue;
    }
    if (nameQuery.length < 2) continue;
    const name = normalizeName(entry.name);
    if (name.startsWith(nameQuery)) tiers[2].push(entry);
    else if (name.split(" ").some((word) => word.startsWith(nameQuery))) tiers[3].push(entry);
    else if (nameQuery.length >= 3 && name.includes(nameQuery)) tiers[4].push(entry);
  }

  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const entry of tier) {
      if (results.length >= limit) return results;
      // The same company can carry several symbols (share classes); show each
      // symbol once.
      if (seen.has(entry.symbol)) continue;
      seen.add(entry.symbol);
      results.push({ symbol: entry.symbol.replace(/-/g, "."), name: titleCaseName(entry.name) });
    }
  }
  return results;
}
