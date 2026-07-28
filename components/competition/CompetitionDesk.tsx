"use client";

import { useState } from "react";
import { fmt } from "@/lib/analysis/indicators";
import { checkEligibility } from "@/lib/competition/rules";
import { useCompetition } from "./CompetitionProvider";
import { CompetitionOptIn } from "./CompetitionOptIn";

type Tab = "holdings" | "activity";

export function CompetitionDesk() {
  const {
    loaded,
    handle,
    optedIn,
    account,
    positions,
    trades,
    summary,
    dailyParticipation,
    standing,
    openTrade,
  } = useCompetition();
  const [tab, setTab] = useState<Tab>("holdings");

  if (!loaded) return null;

  if (!optedIn) {
    return <CompetitionOptIn />;
  }

  if (!account || !summary) {
    return (
      <div className="phase-stub">
        <div className="label">Monthly Leaderboard</div>
        <h2>
          You&rsquo;re in as <strong>@{handle}</strong>.
        </h2>
        <p>
          Your competition account opens with your first trade this month. Head to any research
          memo and place a trade — market hours only, 9:30am&ndash;4:00pm ET on trading days.
        </p>
      </div>
    );
  }

  const tradeCount = trades.length;
  const distinctTickerCount = new Set(trades.map((t) => t.ticker)).size;
  const eligibility = checkEligibility({ tradeCount, distinctTickerCount, dailyParticipation });

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
      </div>

      {tab === "holdings" && (
        <div className="portfolio-pane active">
          <div className="account-summary">
            <div className="as-main">
              <div className="as-label">Total Account Value</div>
              <div className="as-value">${fmt(summary.equity)}</div>
              <div className={`as-delta ${summary.returnPct >= 0 ? "pos" : "neg"}`}>
                {summary.returnPct >= 0 ? "+" : ""}
                {fmt(summary.returnPct, 2)}% since open
              </div>
            </div>
            <div className="as-stat">
              <div className="as-label">Cash</div>
              <div className="as-value">${fmt(summary.cash)}</div>
              <div className="as-sub">{fmt((summary.cash / summary.equity) * 100, 0)}% of portfolio</div>
            </div>
            <div className="as-stat">
              <div className="as-label">Positions Value</div>
              <div className="as-value">${fmt(summary.positionsValue)}</div>
              <div className="as-sub">{positions.length} holdings</div>
            </div>
            <div className="as-stat">
              <div className="as-label">Your Standing</div>
              <div className="as-value">
                {eligibility.eligible ? (standing?.rank != null ? `#${standing.rank}` : "Pending") : "Not Ranked"}
              </div>
              <div className="as-sub">{eligibility.eligible ? "on the public board" : "not yet eligible"}</div>
            </div>
          </div>

          {!eligibility.eligible && (
            <div className="phase-stub" style={{ margin: "24px 48px" }}>
              <div className="label">Not Yet Eligible</div>
              <h2>You&rsquo;re not on the public board yet.</h2>
              <ul style={{ marginTop: 12, paddingLeft: 20, color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>
                {eligibility.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="holdings-section">
            <h3>Holdings</h3>
            {positions.length === 0 ? (
              <div className="holdings-empty">
                <div className="big">No positions yet.</div>
                <div>
                  Open a research memo on any ticker and click <strong>Trade</strong> to place your
                  first competition order.
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
            {trades.length === 0 ? (
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
                    {trades.map((t) => {
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
    </>
  );
}
