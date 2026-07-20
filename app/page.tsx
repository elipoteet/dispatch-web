"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TickerTape } from "@/components/home/TickerTape";

export default function HomePage() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const symbol = ticker.trim();
    router.push(symbol ? `/research/${encodeURIComponent(symbol.toLowerCase())}` : "/research");
  }

  return (
    <section className="page active" id="page-home">
      <div className="hero">
        <div>
          <div className="hero-label">For Independent Investors</div>
          <h1>
            Equity research,
            <br />
            written for readers.
          </h1>
          <form className="hero-search" role="search" aria-label="Run research on a ticker" onSubmit={handleSearch}>
            <label htmlFor="heroTickerInput" className="visually-hidden" style={{ position: "absolute", left: "-9999px" }}>
              Ticker symbol
            </label>
            <input
              id="heroTickerInput"
              type="text"
              placeholder="Try a ticker — AAPL, NVDA, SPY…"
              autoComplete="off"
              spellCheck={false}
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
            <button type="submit">Run Research →</button>
          </form>
          <div className="hero-shortcut">
            Press <span className="kbd">⌘</span> <span className="kbd">K</span> anywhere to search
          </div>
        </div>
        <div className="hero-lede">
          Enter any U.S.-listed ticker and receive a structured research brief — scorecard,
          technicals, fundamentals, sentiment, risks, catalysts — composed from real-time data.
          No black boxes. No algorithmic trading signals dressed as insight. Just the work a
          thoughtful analyst would do, delivered in seconds.
        </div>
      </div>

      <TickerTape />

      <div className="features-head">
        <div className="label">The Dispatch Method</div>
        <h2>Four dimensions. One coherent view.</h2>
      </div>

      <div className="features">
        <div className="feature">
          <div className="feature-num">№ 01 · FUNDAMENTALS</div>
          <h3>The business underneath the ticker.</h3>
          <p>
            Market cap, P/E, profit margin, debt ratios, 52-week structure. Pulled live, labeled
            honestly. We score on growth, profitability, and balance-sheet durability — not
            momentum dressed up as quality.
          </p>
        </div>
        <div className="feature">
          <div className="feature-num">№ 02 · TECHNICALS</div>
          <h3>The tape, read carefully.</h3>
          <p>
            Moving-average structure, RSI, momentum, drawdown, volatility. Every indicator shown
            is one you can verify. We tell you what the chart says, not what we wish it said.
          </p>
        </div>
        <div className="feature">
          <div className="feature-num">№ 03 · SENTIMENT</div>
          <h3>The crowd, without the noise.</h3>
          <p>
            Analyst recommendations, consensus shifts, news flow, recent catalysts. We synthesize
            what Wall Street is saying — then remind you they&rsquo;re often wrong together.
          </p>
        </div>
      </div>

      <div className="time-machine-teaser">
        <div className="label">Not Just a Snapshot</div>
        <h2>Go back and read yesterday&rsquo;s memo, today.</h2>
        <p>
          The Time Machine pulls up any past date and rebuilds the memo as it would have read
          then — technicals and sentiment recalculated from that day&rsquo;s data, fundamentals
          held back rather than shown stale. Then compare it straight to the live memo, side by
          side.
        </p>
        <Link href="/research" className="tm-link">
          Try the Time Machine →
        </Link>
      </div>

      <div className="cta-row">
        <div className="cta-text">
          <div className="label">Begin Your Research</div>
          <h2>
            Look up your first ticker.
            <br />
            It takes five seconds.
          </h2>
        </div>
        <button className="cta-btn" onClick={() => router.push("/research")} type="button">
          Open Research Desk<span className="arrow">→</span>
        </button>
      </div>
    </section>
  );
}
