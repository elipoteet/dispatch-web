"use client";

import { useEffect, useState } from "react";
import { fmt, sign } from "@/lib/analysis/indicators";
import type { TapeItem } from "@/app/api/tape/route";

export function TickerTape() {
  const [items, setItems] = useState<TapeItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tape")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setItems(json.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className="ticker-tape">
        <div className="ticker-tape-inner">
          <span style={{ color: "var(--muted-2)" }}>Loading markets…</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ticker-tape">
        <div className="ticker-tape-inner">
          <span style={{ color: "var(--muted-2)", padding: "0 40px" }}>Markets unavailable right now</span>
        </div>
      </div>
    );
  }

  const renderItem = (item: TapeItem, key: string) => (
    <span className="tt-item" key={key}>
      <span className="tt-sym">{item.symbol}</span>
      <span>${fmt(item.last)}</span>
      <span className={item.pct >= 0 ? "tt-pos" : "tt-neg"}>
        {sign(item.pct)}
        {fmt(item.pct, 2)}%
      </span>
    </span>
  );

  return (
    <div className="ticker-tape">
      <div className="ticker-tape-inner">
        {items.map((item) => renderItem(item, `a-${item.symbol}`))}
        {items.map((item) => renderItem(item, `b-${item.symbol}`))}
      </div>
    </div>
  );
}
