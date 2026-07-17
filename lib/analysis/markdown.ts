// Ported from the-dispatch.html's buildMarkdown()/stripTags(). Original
// scraped the rendered DOM for text; this version reads the same ReportData
// object the UI renders from, so it stays in sync with the memo by
// construction. Browser-only (uses `document` to strip HTML tags reliably,
// entities included) — only ever called from a click handler.

import type { ReportData } from "./report";

function stripTags(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

function paragraphs(html: string): string[] {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return Array.from(tmp.querySelectorAll("p"))
    .map((p) => (p.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// The original stripped the whole catalyst box (heading + bullet divs) into
// one run-on line for markdown. Since this is invisible in the app itself,
// it's a straightforward improvement to keep the bullets as bullets.
function catalystLines(html: string): string[] {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return Array.from(tmp.querySelectorAll("div"))
    .map((d) => (d.textContent || "").replace(/\s+/g, " ").trim().replace(/^•\s*/, ""))
    .filter(Boolean);
}

export function buildMarkdown(report: ReportData): string {
  let md = `# ${report.ticker} — Equity Research Memo\n\n`;
  md += `**${report.name}** · ${report.industry}\n\n`;
  md += `**Price:** ${report.price} ${report.changeText}  \n`;
  md += `**Rating:** ${report.rating} (Composite ${report.composite}/10)  \n`;
  md += `**Generated:** ${report.timestamp}\n\n`;
  md += `---\n\n`;

  md += `## Key Statistics\n\n`;
  for (const s of report.keyStats) {
    md += `- **${s.label}:** ${s.value}${s.sub ? ` _(${s.sub})_` : ""}\n`;
  }
  md += `\n`;

  md += `## Scorecard\n\n`;
  md += `| Dimension | Score | Key Signal |\n|---|---|---|\n`;
  for (const row of report.scorecard) {
    const score = row.score != null ? `${row.score}/10` : "—";
    md += `| ${row.name} | ${score} | ${row.signal} |\n`;
  }
  md += `\n`;

  const sections: Array<[string, string]> = [
    ["Fundamentals", report.proseFundamentalsHtml],
    ["Technicals", report.proseTechnicalsHtml],
    ["Sentiment", report.proseSentimentHtml],
    ["Verdict", report.proseVerdictHtml],
  ];
  for (const [title, html] of sections) {
    const paras = paragraphs(html);
    if (!paras.length) continue;
    md += `## ${title}\n\n`;
    for (const p of paras) md += `${p}\n\n`;
  }

  if (report.risksHtml.length) {
    md += `## Top Risks\n\n`;
    report.risksHtml.forEach((r, i) => {
      md += `${i + 1}. ${stripTags(r)}\n`;
    });
    md += `\n`;
  }

  const catLines = catalystLines(report.catalystHtml);
  if (catLines.length) {
    md += `## Catalysts\n\n`;
    for (const line of catLines) md += `- ${line}\n`;
    md += `\n`;
  }

  md += `---\n\n`;
  md += `_Source: The Dispatch. Not investment advice. Data via Twelve Data & Finnhub._\n`;
  return md;
}
