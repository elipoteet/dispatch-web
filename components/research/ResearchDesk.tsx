"use client";

import { useEffect, useState } from "react";
import { buildReport, type ReportData } from "@/lib/analysis/report";
import { buildHistoricalFundamentals, sliceRowsAsOf } from "@/lib/analysis/historical";
import type { Fundamentals, NewsItem, PriceRow } from "@/lib/providers";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "./Skeleton";
import { ResultsReport } from "./ResultsReport";
import { WatchlistRow } from "./WatchlistRow";
import { HistoricalBanner } from "./HistoricalBanner";
import { CompareView } from "./CompareView";

const EXAMPLES = ["AAPL", "MSFT", "NVDA", "APLD", "TSLA", "GOOGL", "AMZN", "META", "SPY"];

type Status = "idle" | "loading" | "error";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchAndBuildReport(
  sym: string,
  asOf: string | null,
): Promise<{ report: ReportData; fullRows: PriceRow[] }> {
  const url = `/api/analyze/${encodeURIComponent(sym)}${asOf ? `?asOf=${asOf}` : ""}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Could not fetch data for ${sym}.`);
  const rows = json.rows as PriceRow[];
  const fundamentals = json.fundamentals as Fundamentals | null;
  const news = json.news as NewsItem[] | null;

  if (asOf) {
    const sliced = sliceRowsAsOf(rows, asOf);
    if (sliced.length < 30) {
      throw new Error(`Not enough price history before ${asOf} for ${sym}. Try a more recent date.`);
    }
    const histFund = buildHistoricalFundamentals(fundamentals, asOf);
    return { report: buildReport(sym, sliced, histFund, news), fullRows: rows };
  }
  return { report: buildReport(sym, rows, fundamentals, news), fullRows: rows };
}

export function ResearchDesk({
  initialTicker,
  initialReport = null,
  initialRows = null,
  initialAsOf = "",
}: {
  initialTicker: string;
  // Set when the server-rendered /research/[ticker] route already fetched
  // and built the memo — lets the initial render (and its SSR HTML) show
  // the full report immediately instead of an empty shell that only fills
  // in after a client-side fetch, which is what made these pages invisible
  // to crawlers before.
  initialReport?: ReportData | null;
  initialRows?: PriceRow[] | null;
  initialAsOf?: string;
}) {
  const { user } = useAuth();
  const [ticker, setTicker] = useState(initialTicker);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [report, setReport] = useState<ReportData | null>(initialReport);
  const [fullRows, setFullRows] = useState<PriceRow[] | null>(initialRows);
  const [activeAsOf, setActiveAsOf] = useState(initialAsOf);
  const [rangeDays, setRangeDays] = useState(180);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // Date picker's raw value — distinct from activeAsOf, since picking a
  // date doesn't run anything until Run Research is clicked (matches the
  // original: the date is only read at analyze time).
  const [dateInput, setDateInput] = useState(initialAsOf);

  const [compareLoading, setCompareLoading] = useState(false);
  const [compareView, setCompareView] = useState<{ thenReport: ReportData; nowReport: ReportData } | null>(null);

  async function runAnalysis(sym: string, asOf: string | null = null) {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setTicker(clean);
    setStatus("loading");
    setReport(null);
    setCompareView(null);
    try {
      const { report: r, fullRows: fr } = await fetchAndBuildReport(clean, asOf);
      setReport(r);
      setFullRows(fr);
      setActiveAsOf(asOf || "");
      if (asOf) setDateInput(asOf);
      setStatus("idle");
      // Historical-only lookups don't get added to the watchlist — same as
      // the original, which only tracked what you're actually researching now.
      if (user && !asOf) addToWatchlist(clean);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : `Could not fetch data for ${clean}.`);
      setStatus("error");
    }
  }

  // Used by chips/watchlist — always a fresh live lookup, so any stale date
  // sitting in the picker shouldn't carry over.
  function runLive(sym: string) {
    setDateInput("");
    runAnalysis(sym, null);
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
    // The SSR ticker page already fetched and built this report server-side
    // — re-running the client fetch here would just flash the skeleton and
    // redo work for nothing.
    if (initialTicker && !initialReport) runAnalysis(initialTicker);
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
    // A server-rendered ticker page can't add to the watchlist itself
    // (auth is read client-side) — do it here once we know who's signed in,
    // same rule as a live client search: skip historical (asOf) lookups.
    if (initialReport && !initialAsOf) addToWatchlist(initialTicker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleSearch() {
    const asOf = dateInput && dateInput < todayStr() ? dateInput : null;
    runAnalysis(ticker, asOf);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  function handleDateReset() {
    setDateInput("");
    if (ticker) runAnalysis(ticker, null);
  }

  async function handleCompareToToday() {
    if (!activeAsOf || !report) return;
    setCompareLoading(true);
    try {
      const { report: nowReport } = await fetchAndBuildReport(ticker, null);
      setCompareView({ thenReport: report, nowReport });
    } catch {
      // Best-effort — leave the historical memo showing if the live fetch fails.
    } finally {
      setCompareLoading(false);
    }
  }

  const isHistoricalInput = Boolean(dateInput && dateInput < todayStr());
  const minDate = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);

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
        <div className="date-picker-wrap" title="Time Machine — pick a past date to see this memo as it read then">
          <label htmlFor="asOfInput" className="date-picker-label">
            🕐 Time Machine
          </label>
          <input
            id="asOfInput"
            type="date"
            aria-label="Time Machine — view this memo as of a past date"
            max={todayStr()}
            min={minDate}
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
          <button
            className={`date-reset ${isHistoricalInput ? "active" : ""}`}
            id="dateReset"
            type="button"
            aria-label="Reset to today"
            title="Reset to today"
            onClick={handleDateReset}
          >
            Today
          </button>
        </div>
        <button id="analyzeBtn" type="button" onClick={handleSearch} disabled={status === "loading"}>
          Run Research →
        </button>
      </div>

      <WatchlistRow tickers={watchlist} onSelect={runLive} onRemove={removeFromWatchlist} />

      <div className="suggestions">
        <span className="label">Examples:</span>
        {EXAMPLES.map((sym) => (
          <button key={sym} className="chip" type="button" onClick={() => runLive(sym)}>
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

      {status === "idle" && report && !compareView && (
        <ResultsReport
          report={report}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          historicalBanner={
            activeAsOf && fullRows ? (
              <HistoricalBanner
                sym={ticker}
                asOfDate={activeAsOf}
                thenPrice={report.snapshot.last}
                nowPrice={fullRows[fullRows.length - 1].close}
                onCompare={handleCompareToToday}
                loading={compareLoading}
              />
            ) : undefined
          }
        />
      )}

      {compareView && (
        <CompareView
          thenReport={compareView.thenReport}
          nowReport={compareView.nowReport}
          sym={ticker}
          thenDate={activeAsOf}
          onClose={() => setCompareView(null)}
        />
      )}
    </>
  );
}
