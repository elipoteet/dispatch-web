"use client";

import { useState } from "react";
import { fmt } from "@/lib/analysis/indicators";
import { usePortfolio } from "./PortfolioProvider";
import { EquityChart } from "./EquityChart";

type Tab = "holdings" | "activity" | "settings";

export function PortfolioDesk() {
  const {
    loaded,
    account,
    positions,
    transactions,
    summary,
    curve,
    openTrade,
    openOnboarding,
    resetAccount,
    onboardingOpen,
  } = usePortfolio();
  const [tab, setTab] = useState<Tab>("holdings");

  if (loaded && !account && !onboardingOpen) {
    return (
      <div className="phase-stub">
        <div className="label">Paper Trading</div>
        <h2>You don&rsquo;t have a paper account yet.</h2>
        <p>Open one to start tracking simulated trades against real market prices.</p>
        <button
          className="auth-submit"
          style={{ marginTop: 20, width: "auto", padding: "12px 24px" }}
          type="button"
          onClick={openOnboarding}
        >
          Open Paper Account
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="portfolio-tabs" role="tablist">
        <button
          className={`portfolio-tab ${tab === "holdings" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "holdings"}
          onClick={() => setTab("holdings")}
        >
          Holdings
        </button>
        <button
          className={`portfolio-tab ${tab === "activity" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          className={`portfolio-tab ${tab === "settings" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "settings"}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </div>

      {tab === "holdings" && account && summary && (
        <div className="portfolio-pane active">
          <div className="account-summary">
            <div className="as-main">
              <div className="as-label">Total Account Value</div>
              <div className="as-value">${fmt(summary.totalValue)}</div>
              <div className={`as-delta ${summary.totalReturnPct >= 0 ? "pos" : "neg"}`}>
                {summary.totalValue - summary.startingCash >= 0 ? "+" : "-"}$
                {fmt(Math.abs(summary.totalValue - summary.startingCash))} (
                {summary.totalReturnPct >= 0 ? "+" : ""}
                {fmt(summary.totalReturnPct, 2)}%) since open
              </div>
            </div>
            <div className="as-stat">
              <div className="as-label">Cash</div>
              <div className="as-value">${fmt(summary.cash)}</div>
              <div className="as-sub">{fmt((summary.cash / summary.totalValue) * 100, 0)}% of portfolio</div>
            </div>
            <div className="as-stat">
              <div className="as-label">Positions Value</div>
              <div className="as-value">${fmt(summary.positionsValue)}</div>
              <div className="as-sub">{positions.length} holdings</div>
            </div>
            <div className="as-stat">
              <div className="as-label">Unrealized P&amp;L</div>
              <div className={`as-value ${summary.unrealizedPL >= 0 ? "pos" : "neg"}`}>
                {summary.unrealizedPL >= 0 ? "+" : "-"}${fmt(Math.abs(summary.unrealizedPL))}
              </div>
              <div className="as-sub">on cost basis ${fmt(summary.costBasis)}</div>
            </div>
          </div>

          <div className="equity-section">
            <div className="header">
              <h3>Equity Curve vs. SPY</h3>
              <div className="legend">
                <span className="legend-item">
                  <span className="legend-swatch" style={{ background: "var(--navy)" }} />
                  Your Portfolio
                </span>
                <span className="legend-item">
                  <span className="legend-swatch" style={{ background: "var(--gold)" }} />
                  SPY Benchmark
                </span>
              </div>
            </div>
            <EquityChart curve={curve} startingCash={account.startingCash} />
          </div>

          <div className="holdings-section">
            <h3>Holdings</h3>
            {positions.length === 0 ? (
              <div className="holdings-empty">
                <div className="big">No positions yet.</div>
                <div>
                  Open a research memo on any ticker and click <strong>Trade</strong> to place your first
                  paper order.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Shares</th>
                    <th>Avg Cost</th>
                    <th>Current</th>
                    <th>Market Value</th>
                    <th>Unrealized P&amp;L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...positions]
                    .sort((a, b) => a.ticker.localeCompare(b.ticker))
                    .map((p) => (
                      <tr key={p.ticker}>
                        <td>
                          <span className="h-sym">{p.ticker}</span>
                        </td>
                        <td>{p.shares}</td>
                        <td>${fmt(p.avgCost)}</td>
                        <td>
                          ${fmt(p.currentPrice)}
                          {p.isStale && (
                            <span style={{ color: "var(--muted-2)", fontSize: 10, letterSpacing: "0.1em" }}>
                              {" "}
                              STALE
                            </span>
                          )}
                        </td>
                        <td>${fmt(p.marketValue)}</td>
                        <td className={p.unrealizedPL >= 0 ? "pos" : "neg"}>
                          {p.unrealizedPL >= 0 ? "+" : "-"}${fmt(Math.abs(p.unrealizedPL))}
                          <br />
                          <span style={{ fontSize: 11, opacity: 0.8 }}>
                            {p.unrealizedPLPct >= 0 ? "+" : ""}
                            {fmt(p.unrealizedPLPct, 2)}%
                          </span>
                        </td>
                        <td className="h-actions">
                          <button
                            className="h-trade-btn"
                            type="button"
                            onClick={() => openTrade(p.ticker, p.currentPrice)}
                          >
                            Buy
                          </button>
                          <button
                            className="h-trade-btn sell"
                            type="button"
                            onClick={() => openTrade(p.ticker, p.currentPrice)}
                          >
                            Sell
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="portfolio-pane active">
          <div className="activity-section">
            <h3
              style={{
                fontFamily: "'Inter',sans-serif",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--navy)",
                marginBottom: 20,
              }}
            >
              Transaction History
            </h3>
            {transactions.length === 0 ? (
              <div className="holdings-empty">
                <div className="big">No transactions yet.</div>
                <div>Your trade history will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Symbol</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const dt = new Date(t.executedAt);
                    const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <tr key={t.id}>
                        <td>
                          {dateStr}
                          <br />
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>{timeStr}</span>
                        </td>
                        <td>
                          <span className={`a-type ${t.side}`}>{t.side.toUpperCase()}</span>
                        </td>
                        <td>
                          <strong style={{ fontFamily: "'Inter',sans-serif", color: "var(--navy)", fontSize: 14 }}>
                            {t.ticker}
                          </strong>
                        </td>
                        <td>{t.shares}</td>
                        <td>${fmt(t.price)}</td>
                        <td>${fmt(t.shares * t.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && account && (
        <div className="portfolio-pane active">
          <div className="settings-pane">
            <div className="field">
              <label>Account Created</label>
              <div className="field-value">{new Date(account.createdAt).toLocaleDateString("en-US")}</div>
            </div>
            <div className="field">
              <label>Starting Cash</label>
              <div className="field-value">${fmt(account.startingCash)}</div>
            </div>
            <div className="field">
              <label>Reset Account</label>
              <div className="field-desc">
                Wipes all positions, transactions, and the equity curve. Lets you restart with a fresh paper
                account at any starting balance.
              </div>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset your paper account? This wipes all positions, transactions, and the equity curve. You'll be asked to set a new starting balance.",
                    )
                  ) {
                    resetAccount();
                  }
                }}
              >
                Reset Account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
