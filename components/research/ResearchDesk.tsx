"use client";

import { useEffect, useState } from "react";
import { buildReport, type ReportData } from "@/lib/analysis/report";
import type { Fundamentals, NewsItem, PriceRow } from "@/lib/providers";
import { Skeleton } from "./Skeleton";
import { ResultsReport } from "./ResultsReport";

const EXAMPLES = ["AAPL", "MSFT", "NVDA", "APLD", "TSLA", "GOOGL", "AMZN", "META", "SPY"];

type Status = "idle" | "loading" | "error";

export function ResearchDesk({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [rangeDays, setRangeDays] = useState(180);

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
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : `Could not fetch data for ${clean}.`);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (initialTicker) runAnalysis(initialTicker);
    // Only run for the ticker the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

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
