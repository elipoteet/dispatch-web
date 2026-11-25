// Runs the nightly alerts job against the live site, one ticker per request,
// from .github/workflows/alerts.yml (fix/price-credits, 25 November 2026).
// See app/api/cron/alerts/route.ts for what each step does.
//
// Needs CRON_SECRET. SITE_URL defaults to the live site. DRY_RUN=1 computes
// and reports without writing anything (the SEC step is skipped). Plain Node
// 24, no dependencies. Prints no secrets.

import { appendFileSync } from "node:fs";

const SITE = (process.env.SITE_URL || "https://www.dispatchresearch.com").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET || "";
const DRY = process.env.DRY_RUN === "1";
// Twelve Data allows eight requests a minute for the whole site. A ticker
// costs at most one, so eight seconds apart leaves room for visitors.
const SPACING_MS = 8_000;
const RETRY_AFTER_MS = 65_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = [];
const say = (line) => {
  console.log(line);
  summary.push(line);
};

async function step(query) {
  const res = await fetch(`${SITE}/api/cron/alerts?${query}${DRY ? "&dry=1" : ""}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
    signal: AbortSignal.timeout(70_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status}${body?.error ? `: ${body.error}` : ""}`);
  return body;
}

function describe(r) {
  const d = r.decision;
  const state = r.current ? `RSI ${r.current.rsiState ?? "?"}, averages ${r.current.maState ?? "?"}` : "";
  const was = r.previous ? `last checked ${r.previous.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "never checked";
  switch (d.outcome) {
    case "no prices":
      return "no prices could be had; nothing sent, not marked checked";
    case "stale":
      return `prices only through ${d.through}, not ${d.latest}; nothing sent, not marked checked`;
    case "baseline":
      return `first check (${state}); recorded, nothing sent`;
    case "already checked":
      return `${d.lastSession} already checked; nothing new`;
    case "re-baselined":
      return `${was}, ${d.sessionsBehind} sessions ago; re-baselined (${state}), nothing sent`;
    case "compared":
      return d.alerts.length
        ? `compared with ${d.lastSession}: ${d.alerts.map((a) => `${a.type} ${a.oldValue} → ${a.newValue}`).join(", ")}`
        : `compared with ${d.lastSession}: no change (${state})`;
    default:
      return JSON.stringify(d);
  }
}

async function main() {
  if (!SECRET) throw new Error("CRON_SECRET is not set. Add it under the repository's Settings, Secrets and variables, Actions.");
  const list = await step("step=list");
  say(`${DRY ? "DRY RUN: nothing will be written. " : ""}Latest session ${list.latestSession}; ${list.tickers.length} watched tickers.`);

  const results = new Map();
  const retry = [];
  for (const [i, ticker] of list.tickers.entries()) {
    if (i > 0) await sleep(SPACING_MS);
    try {
      const r = await step(`step=ticker&ticker=${encodeURIComponent(ticker)}`);
      results.set(ticker, r);
      if (r.decision.outcome === "no prices" || r.decision.outcome === "stale") retry.push(ticker);
    } catch (err) {
      results.set(ticker, { error: err.message });
      retry.push(ticker);
    }
  }
  // One more try for anything that got no fresh prices: usually Twelve Data's
  // minute, shared with visitors, was used up.
  if (retry.length) {
    await sleep(RETRY_AFTER_MS);
    for (const [i, ticker] of retry.entries()) {
      if (i > 0) await sleep(SPACING_MS);
      try {
        results.set(ticker, await step(`step=ticker&ticker=${encodeURIComponent(ticker)}`));
      } catch (err) {
        results.set(ticker, { error: err.message });
      }
    }
  }

  let failed = 0;
  let events = 0;
  for (const ticker of list.tickers) {
    const r = results.get(ticker);
    if (r.error) {
      failed++;
      say(`${ticker.padEnd(6)} failed: ${r.error}`);
      continue;
    }
    if (r.decision.outcome === "no prices") failed++;
    events += r.written?.events ?? 0;
    let line = `${ticker.padEnd(6)} ${describe(r)}`;
    if (DRY && r.oldRuleWouldSend?.length) line += ` [the old job would have sent: ${r.oldRuleWouldSend.map((a) => `${a.type} ${a.oldValue} → ${a.newValue}`).join(", ")}]`;
    say(line);
  }
  say(DRY ? "Dry run: no alerts sent, nothing written." : `${events} alert${events === 1 ? "" : "s"} sent.`);

  const sec = await step("step=sec").catch((err) => ({ error: err.message }));
  say(sec.error ? `SEC refresh failed: ${sec.error}` : sec.skipped ? `SEC refresh: ${sec.skipped}` : `SEC refresh: ${sec.insiders.filings} insider filings across ${sec.insiders.companies} companies, ${sec.riskReports} risk-factor comparisons.`);

  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.map((l) => `    ${l}`).join("\n") + "\n");
  // A run that priced nothing fails, so GitHub emails about it.
  if (list.tickers.length > 0 && failed === list.tickers.length) throw new Error(`No ticker could be priced (${failed} of ${list.tickers.length}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
