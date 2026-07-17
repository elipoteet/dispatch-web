"use client";

import { useState } from "react";

const EXAMPLES = ["AAPL", "MSFT", "NVDA", "APLD", "TSLA", "GOOGL", "AMZN", "META", "SPY"];

export function TickerSearchRow({ defaultTicker }: { defaultTicker: string }) {
  const [ticker, setTicker] = useState(defaultTicker);

  return (
    <>
      <div className="search-row">
        <label htmlFor="tickerInput" className="visually-hidden" style={{ position: "absolute", left: "-9999px" }}>
          Ticker symbol to analyze
        </label>
        <input
          id="tickerInput"
          type="text"
          placeholder="AAPL, NVDA, APLD, SPY…"
          autoComplete="off"
          spellCheck={false}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
        <button id="analyzeBtn" type="button" disabled title="Live analysis lands in a later phase">
          Run Research →
        </button>
      </div>

      <div className="suggestions">
        <span className="label">Examples:</span>
        {EXAMPLES.map((sym) => (
          <button
            key={sym}
            className="chip"
            type="button"
            onClick={() => setTicker(sym)}
          >
            {sym}
          </button>
        ))}
      </div>
    </>
  );
}
