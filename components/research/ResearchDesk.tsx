"use client";

import { useEffect, useState } from "react";
import { buildReport, type ReportData } from "@/lib/analysis/report";
import type { Fundamentals, NewsItem, PriceRow } from "@/lib/providers";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "./Skeleton";
import { ResultsReport } from "./ResultsReport";
import { WatchlistRow } from "./WatchlistRow";

const EXAMPLES = ["AAPL", "MSFT", "NVDA", "APLD", "TSLA", "GOOGL", "AMZN", "META", "SPY"];

type Status = "idle" | "loading" | "error";

export function ResearchDesk({ initialTicker }: { initialTicker: string }) {
  const { user } = useAuth();
  const [ticker, setTicker] = useState(initialTicker);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [rangeDays, setRangeDays] = useState(180);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  async function runAnalysis(sym: string) {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setTicker(clean);
    setStatus("loading");
    setReport(null);
    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Could not fetch data for ${clean}.`);
      const rows = json.rows as PriceRow[];
      const fundamentals = json.fundamentals as Fundamentals | null;
      const news = json.news as NewsItem[] | null;
      setReport(buildReport(clean, rows, fundamentals, news));
      setStatus("idle");
      if (user) addToWatchlist(clean);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : `Could not fetch data for ${clean}.`);
      setStatus("error");
    }
  }

  async function addToWatchlist(sym: string) {
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: sym }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setWatchlist(json.tickers ?? []);
    } catch {
      // Non-critical — the memo already rendered either way.
    }
  }

  async function removeFromWatchlist(sym: string) {
    try {
      const res = await fetch(`/api/watchlist?ticker=${encodeURIComponent(sym)}`, { method: "DELETE" });
      if (!res.ok) return;
      const json = await res.json();
      setWatchlist(json.tickers ?? []);
    } catch {
      // Non-critical.
    }
  }

  useEffect(() => {
    if (initialTicker) runAnalysis(initialTicker);
    // Only run for the ticker the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
      return;
    }
    fetch("/api/watchlist")
      .then((res) => (res.ok ? res.json() : { tickers: [] }))
      .then((json) => setWatchlist(json.tickers ?? []))
      .catch(() => {});
  }, [user]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis(ticker);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") runAnalysis(ticker);
  }

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
          onKeyDown={handleInputKeyDown}
        />
        <button id="analyzeBtn" type="button" onClick={handleSubmit} disabled={status === "loading"}>
          Run Research →
        </button>
      </div>

      <WatchlistRow tickers={watchlist} onSelect={runAnalysis} onRemove={removeFromWatchlist} />

      <div className="suggestions">
        <span className="label">Examples:</span>
        {EXAMPLES.map((sym) => (
          <button key={sym} className="chip" type="button" onClick={() => runAnalysis(sym)}>
            {sym}
          </button>
        ))}
      </div>

      {status === "error" && (
        <div className="status error" role="status" aria-live="polite">
          {errorMsg}
        </div>
      )}

      {status === "loading" && <Skeleton />}

      {status === "idle" && report && (
        <ResultsReport report={report} rangeDays={rangeDays} onRangeChange={setRangeDays} />
      )}
    </>
  );
}
