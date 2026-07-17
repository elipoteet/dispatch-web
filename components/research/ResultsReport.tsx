import type { ReportData } from "@/lib/analysis/report";
import { ChartSVG } from "./ChartSVG";

const RANGES = [
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "1Y" },
  { days: 1825, label: "5Y" },
];

export function ResultsReport({
  report,
  rangeDays,
  onRangeChange,
}: {
  report: ReportData;
  rangeDays: number;
  onRangeChange: (days: number) => void;
}) {
  return (
    <div className="results active" id="results">
      <div className="report-header">
        <div className="report-meta-top">
          <span>The Dispatch Equity Research Memo</span>
          <span id="reportTimestamp">{report.timestamp}</span>
        </div>
        <div className="report-title-row">
          <div>
            <div className="report-ticker">{report.ticker}</div>
            <div className="report-name">{report.name}</div>
            <div className="report-industry">{report.industry}</div>
          </div>
          <div className="report-price">
            <div className="verdict-label">Last Price</div>
            <div className="report-price-val">{report.price}</div>
            <div className={`report-change mono ${report.changeClassName}`}>{report.changeText}</div>
          </div>
          <div className="report-verdict">
            <div className="verdict-label">Rating</div>
            <div>
              <span className={`verdict-badge ${report.ratingClass}`}>{report.rating}</span>
            </div>
            <div className="verdict-score">Composite {report.composite}/10</div>
          </div>
        </div>
      </div>

      <div className="key-stats">
        {report.keyStats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-val ${s.className || ""}`}>{s.value}</div>
            {s.sub && <div className="stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="scorecard-section">
        <div className="section-title">Scorecard</div>
        <div style={{ overflowX: "auto" }}>
          <table className="scorecard-table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Dimension</th>
                <th>Score</th>
                <th>Key Signal</th>
              </tr>
            </thead>
            <tbody>
              {report.scorecard.map((row) => (
                <tr key={row.name} className={row.isComposite ? "composite-row" : undefined}>
                  <td className="dim-name">{row.name}</td>
                  <td className="score-cell">
                    {row.score != null ? `${row.score}/10` : "—"}
                    {row.score != null && (
                      <span className="score-bar">
                        <span className="score-bar-fill" style={{ width: row.score * 10 + "%" }} />
                      </span>
                    )}
                  </td>
                  <td className="signal">
                    {row.isComposite ? (
                      <strong style={{ color: "var(--accent)" }}>{row.signal}</strong>
                    ) : (
                      row.signal
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-controls">
          <div className="range-buttons">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                className={`range-btn ${rangeDays === r.days ? "active" : ""}`}
                onClick={() => onRangeChange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: "var(--navy)" }} />
              Price
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: "var(--gold)" }} />
              50-Day MA
            </span>
            <span className="legend-item">
              <span
                className="legend-swatch"
                style={{ background: "var(--accent)", opacity: 0.7, borderTop: "1px dashed var(--accent)" }}
              />
              200-Day MA
            </span>
          </div>
        </div>
        <ChartSVG rows={report.rows} rangeDays={rangeDays} />
      </div>

      <div className="report-body">
        <div className="report-grid">
          <div>
            <div className="section-title">Fundamentals</div>
          </div>
          <div className="prose" dangerouslySetInnerHTML={{ __html: report.proseFundamentalsHtml }} />
        </div>
      </div>

      <div className="report-body">
        <div className="report-grid">
          <div>
            <div className="section-title">Technicals</div>
          </div>
          <div className="prose" dangerouslySetInnerHTML={{ __html: report.proseTechnicalsHtml }} />
        </div>
      </div>

      <div className="report-body">
        <div className="report-grid">
          <div>
            <div className="section-title">Sentiment</div>
          </div>
          <div className="prose" dangerouslySetInnerHTML={{ __html: report.proseSentimentHtml }} />
        </div>
      </div>

      <div className="report-body">
        <div className="report-grid">
          <div>
            <div className="section-title">Verdict</div>
          </div>
          <div className="prose" dangerouslySetInnerHTML={{ __html: report.proseVerdictHtml }} />
        </div>
      </div>

      <div className="risks-catalyst-row">
        <div className="risks-col">
          <div className="section-title">Top Risks</div>
          <ol className="risks-list">
            {report.risksHtml.map((html, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: html }} />
            ))}
          </ol>
        </div>
        <div className="catalyst-col">
          <div className="section-title">Catalysts</div>
          <div className="catalyst-box" dangerouslySetInnerHTML={{ __html: report.catalystHtml }} />
        </div>
      </div>

      {report.news && report.news.length > 0 && (
        <div className="news-section">
          <div className="section-title">Recent News</div>
          <div className="news-list">
            {report.news.map((n, i) => {
              const d = new Date(n.datetime * 1000);
              const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div className="news-item" key={i}>
                  <div className="news-meta">
                    {dateStr} · {n.source || "News"}
                  </div>
                  <a className="news-headline" href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.headline}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="disclaimer">
        <strong style={{ color: "var(--navy)", fontStyle: "normal" }}>Disclaimer.</strong> This research memo is
        generated algorithmically from public data and is provided for informational purposes only. It is not
        investment advice, an offer, or a solicitation to buy or sell any security. Ratings are derived from
        rule-based scoring across fundamentals, technicals, and sentiment — they are descriptive summaries, not
        predictions. Investors should conduct their own due diligence and consult a qualified advisor before making
        investment decisions. Data sourced from Twelve Data and Finnhub.
      </div>
    </div>
  );
}
