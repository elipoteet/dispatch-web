"use client";

import { useEffect, useState } from "react";
import { firstCashtag } from "./cashtags";
import type { TickerSnapshot } from "@/lib/analysis/tickerSnapshot";

const DEBOUNCE_MS = 800;

// Debounced first-ticker detection — shared by Composer.tsx and
// SpaceComposer.tsx (pulled out here in phase three rather than
// duplicated, since a Space post needs the exact same ticker-attach
// behavior with none of the type/scaffold/position/change-my-mind
// machinery around it). Only re-fetches when the *first* recognized
// ticker in the body actually changes — retyping within the same symbol,
// or text after it, doesn't re-trigger. See docs/phase-two.md's rate
// limit rules: 800ms debounce, one fetch per draft, both Finnhub-only
// (lib/analysis/tickerSnapshot.ts via
// app/api/composer/ticker/[symbol]/route.ts), never Twelve Data.
export function useTickerAttach(body: string) {
  const [snapshot, setSnapshot] = useState<TickerSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [checkedTicker, setCheckedTicker] = useState<string | null>(null);

  useEffect(() => {
    const ticker = firstCashtag(body);
    if (ticker === checkedTicker) return;

    const timeout = setTimeout(async () => {
      if (!ticker) {
        setSnapshot(null);
        setCheckedTicker(null);
        return;
      }
      setSnapshotLoading(true);
      try {
        const res = await fetch(`/api/composer/ticker/${encodeURIComponent(ticker)}`);
        const data = await res.json().catch(() => ({ snapshot: null }));
        setSnapshot(data.snapshot ?? null);
      } catch {
        setSnapshot(null);
      } finally {
        setCheckedTicker(ticker);
        setSnapshotLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [body, checkedTicker]);

  // Called after a successful post, so a fresh draft doesn't start out
  // still showing the last draft's attached card.
  function reset() {
    setSnapshot(null);
    setCheckedTicker(null);
  }

  return { snapshot, snapshotLoading, reset };
}
