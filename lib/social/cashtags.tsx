import type { ReactNode } from "react";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";

// Built from TICKER_PATTERN's own character class (stripping its ^/$
// anchors) rather than a separate hand-written regex, so cashtag detection
// can never drift out of sync with how /research/[ticker] itself validates
// a ticker symbol.
//
// A fresh RegExp per call, deliberately — a single shared module-level
// instance with the `g` flag carries a stateful `lastIndex` that leaks
// between calls (confirmed empirically: calling .exec() in one function
// silently makes a later .matchAll() in another skip earlier matches,
// since matchAll starts from the regex's current lastIndex rather than
// always resetting to 0). Compiling a new one per call costs nothing
// meaningful and removes the whole class of bug.
function cashtagPattern(): RegExp {
  return new RegExp(String.raw`\$(${TICKER_PATTERN.source.slice(1, -1)})\b`, "g");
}

// Every `$TICKER`-shaped token in a draft, in order of first appearance —
// "recognized" here means syntactically matches, not provider-confirmed
// (only the first one gets a live lookup; see docs/phase-two.md). Used by
// the composer to decide which symbol to fetch a snapshot for.
export function parseCashtags(body: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of body.matchAll(cashtagPattern())) {
    const symbol = m[1];
    if (!seen.has(symbol)) {
      seen.add(symbol);
      ordered.push(symbol);
    }
  }
  return ordered;
}

// The first cashtag in a draft — the one that gets a live data-card fetch.
export function firstCashtag(body: string): string | null {
  const match = cashtagPattern().exec(body);
  return match ? match[1] : null;
}

// Styles every `$TICKER` occurrence in a published body gold-monospace —
// every recognized token, not just the one that got a live snapshot (see
// docs/phase-two.md: "later ones render as styled text and attach
// nothing"). Not linked anywhere yet — ticker pages arrive in phase three.
export function renderCashtags(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const m of body.matchAll(cashtagPattern())) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      nodes.push(body.slice(lastIndex, start));
    }
    nodes.push(
      <span key={`cashtag-${key++}`} className="cashtag">
        ${m[1]}
      </span>,
    );
    lastIndex = start + m[0].length;
  }
  if (lastIndex < body.length) {
    nodes.push(body.slice(lastIndex));
  }
  return nodes;
}
