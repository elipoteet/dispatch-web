// The daily watcher (Phase 1, 21 November 2026), run by
// .github/workflows/watcher.yml. Plain checks, no AI, read-only.
//
// Why: Vercel paused the whole account on 17 November 2026 (13 h 53 min of
// Active CPU against the Hobby plan's 4 hours) with no warning anyone saw. A
// Hobby team can't read its usage through Vercel's API (POST
// /v2/billing/costs answers "Plan not found", HTTP 404; per-route metrics need
// the paid Observability Plus; checked 20 November 2026), so this watches what
// can be seen instead:
//   site          the live site answers, and isn't Vercel's "Deployment Paused"
//   cache         /screener and The Compounder come from Vercel's cache
//   screener-job  the nightly screener job ran in the last 26 hours and published
//   alerts-job    the alerts job ran in the last 26 hours
//   counts        each starting screen's company count is in its normal range
//   supabase      the database answers
//   twelve-data   today's Twelve Data credits are under 70% of 800
//   vercel-cpu    Active CPU under 70% of 4 hours, if Vercel will say (not on Hobby)
//
// It opens one GitHub issue when something needs action (GitHub emails the
// owner), edits it when the list changes, and closes it when all is clear.
// On Mondays (UTC) it also posts a short weekly summary.
//
// Read-only: every database request is a GET, and the fetch it uses refuses
// any other method to the database's host. No secret is printed: everything
// shown is scrubbed of every secret's value, and keys travel in headers only.
//
// Environment: SUPABASE_URL and SUPABASE_ANON_KEY (the database's public key;
// it reads only watcher_status(), migration 0031), TWELVE_DATA_API_KEY,
// VERCEL_TOKEN (optional), GITHUB_TOKEN and GITHUB_REPOSITORY (from Actions,
// to file issues). A missing one makes its check "skipped", never a failure.
// Local: node --env-file=.env.local scripts/watcher/watch.mjs
// (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are read too).

import { appendFileSync } from "node:fs";

export const SITE = (process.env.SITE_URL ?? "https://www.dispatchresearch.com").replace(/\/$/, "");
export const FRESH_HOURS = 26;
export const WARN_SHARE = 0.7;
export const CPU_LIMIT_HOURS = 4;
// The public key isn't secret, but it's kept out of logs all the same; the
// service key isn't used, and is listed in case it's ever set.
const SECRETS = ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_TOKEN", "TWELVE_DATA_API_KEY", "GITHUB_TOKEN"];

// Company counts per starting screen on 21 November 2026 (/screener). A count
// moves a little every night as filings arrive; one that halves or doubles,
// or a screen that disappears, means something broke.
export const BASELINES = {
  "the-compounder": 29,
  "high-return-on-capital": 97,
  "revenue-up-ten-years-in-a-row": 128,
  "strong-free-cash-flow": 117,
  "fast-growth-already-profitable": 141,
  "rule-of-40": 115,
  "margins-widening": 125,
  "fast-growth-still-losing-money": 125,
  "buying-back-shares": 89,
  "dividends-covered-by-cash-flow": 131,
  "more-cash-than-debt": 144,
  "profits-without-the-cash": 79,
  "issuing-shares-fast": 130,
  "based-in-new-england": 178,
};
export const UNIVERSE = { min: 4000, max: 5500 };

export const LIMITS_TEXT = [
  "Free-plan limits, as published (checked 21 November 2026):",
  "- Vercel Hobby: 4 hours of Active CPU a month for the account; going over pauses every deployment until Vercel support unpauses it. Usage isn't readable through the API on Hobby.",
  "- Supabase Free: 500 MB database, 5 GB egress (and 5 GB cached), 50,000 monthly active users, 1 GB file storage, 2 active projects. Paused after 1 week of inactivity.",
  "- Twelve Data Basic: 8 credits a minute, 800 a day, reset at midnight UTC; 429 when used up.",
].join("\n");

// —— Secrets stay out of logs ——
export function scrub(text, env = process.env) {
  let out = String(text);
  for (const name of SECRETS) {
    const value = env[name];
    if (value && value.length >= 6) out = out.split(value).join("***");
  }
  return out;
}

// —— Read-only database access ——
export function readOnlyFetch(baseFetch, databaseUrl) {
  const host = databaseUrl ? new URL(databaseUrl).host : null;
  return async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const fromRequest = typeof input === "object" && input !== null && !(input instanceof URL) ? input.method : undefined;
    const method = String(init.method ?? fromRequest ?? "GET").toUpperCase();
    if (host && new URL(url).host === host && method !== "GET" && method !== "HEAD") {
      throw new Error(`Refused a ${method} to the database: the watcher only reads.`);
    }
    return baseFetch(input, init);
  };
}

// —— Pure judgements ——
const ok = (key, name, detail) => ({ key, name, state: "ok", detail });
const action = (key, name, detail, todo) => ({ key, name, state: "action", detail, todo });
const skipped = (key, name, detail) => ({ key, name, state: "skipped", detail });

// Vercel's pause has shown two faces: "DEPLOYMENT_PAUSED" (503, 17 November
// 2026) and "DEPLOYMENT_DISABLED" (402 Payment Required, 25 November 2026).
export function classifySite({ status, vercelError = "", body = "" }) {
  if (/DEPLOYMENT_(PAUSED|DISABLED)/i.test(vercelError) || ((status === 503 || status === 402) && /DEPLOYMENT_(PAUSED|DISABLED)/i.test(body))) return "paused";
  if (status === 200) return "ok";
  return "down";
}

export function isCached(header) {
  return /^(HIT|PRERENDER|STALE|REVALIDATED)$/i.test(String(header ?? "").trim());
}

const hoursSince = (iso, now) => (iso ? (now.getTime() - new Date(iso).getTime()) / 3.6e6 : Infinity);
const when = (iso) => (iso ? `${String(iso).slice(0, 16).replace("T", " ")} UTC` : "never");

// `run` is watcher_status()'s screener_run (migration 0031): times, mode,
// whether it failed and how many companies it published. The error text and
// the reason for not publishing stay in the screener_runs table, which the
// public key can't read.
export function judgeScreenerJob(run, metricsUpdatedAt, now = new Date()) {
  const K = "screener-job";
  const N = "Screener job";
  const todo = "Check Vercel's Cron Jobs page for /api/cron/screener, and the newest screener_runs row in Supabase (its error, or companies_skipped's \"not published because\"); a failed night keeps yesterday's figures.";
  if (!run) return action(K, N, "No run is recorded at all.", todo);
  const age = hoursSince(run.started_at, now);
  if (age > FRESH_HOURS) return action(K, N, `The last run started ${when(run.started_at)}, over ${FRESH_HOURS} hours ago.`, todo);
  if (!run.finished_at) {
    if (age < 1) return ok(K, N, `Running now (started ${when(run.started_at)}).`);
    return action(K, N, `The run that started ${when(run.started_at)} never finished.`, todo);
  }
  if (run.failed) return action(K, N, `The run at ${when(run.started_at)} failed.`, todo);
  const published = run.published;
  if (published == null) return action(K, N, `The run at ${when(run.started_at)} didn't publish.`, todo);
  if (hoursSince(metricsUpdatedAt, now) > FRESH_HOURS) {
    return action(K, N, `The run says it published, but the screener's table was last updated ${when(metricsUpdatedAt)}.`, todo);
  }
  return ok(K, N, `Ran ${when(run.started_at)} and published ${Number(published).toLocaleString("en-US")} companies.`);
}

export function judgeAlertsJob(lastCheckedAt, watchedTickers, now = new Date()) {
  const K = "alerts-job";
  const N = "Alerts job";
  if (watchedTickers === 0) return skipped(K, N, "No one watches a ticker, so the job leaves no trace to check.");
  if (hoursSince(lastCheckedAt, now) > FRESH_HOURS) {
    return action(
      K,
      N,
      `Watched tickers were last checked ${when(lastCheckedAt)}, over ${FRESH_HOURS} hours ago.`,
      "Check the \"Alerts job\" workflow's latest run in GitHub Actions (before fix/price-credits is merged, the job is Vercel's cron for /api/cron/alerts). A run that found no fresh prices says so per ticker.",
    );
  }
  return ok(K, N, `Last checked watched tickers ${when(lastCheckedAt)}.`);
}

// The starting screens' counts and the universe from the cached /screener page.
export function parseScreener(html) {
  const counts = {};
  for (const m of String(html).matchAll(/href="\/screener\/([a-z0-9-]+)"[\s\S]*?([\d,]+) compan(?:y|ies)/g)) {
    if (!(m[1] in counts)) counts[m[1]] = Number(m[2].replace(/,/g, ""));
  }
  const about = String(html).match(/Filter about ([\d,]+)/);
  return { counts, universe: about ? Number(about[1].replace(/,/g, "")) : null };
}

export function judgeCounts({ counts, universe }, baselines = BASELINES) {
  const K = "counts";
  const N = "Screen counts";
  const problems = [];
  for (const [slug, base] of Object.entries(baselines)) {
    const n = counts[slug];
    if (n == null) problems.push(`${slug} is missing from /screener`);
    else if (n < 5 || n < base / 2 || n > base * 2) problems.push(`${slug} shows ${n} companies (normal: about ${base})`);
  }
  if (universe == null) problems.push("the page doesn't say how many companies it covers");
  else if (universe < UNIVERSE.min || universe > UNIVERSE.max) problems.push(`the screener covers about ${universe} companies (normal: ${UNIVERSE.min.toLocaleString("en-US")}–${UNIVERSE.max.toLocaleString("en-US")})`);
  if (problems.length) {
    return action(K, N, `${problems.join("; ")}.`, "Open the screen and its newest screener_runs row: a count that halves or doubles overnight usually means a frames file or a rule went wrong.");
  }
  return ok(K, N, `All ${Object.keys(baselines).length} screens in range; about ${universe.toLocaleString("en-US")} companies.`);
}

export function judgeTwelveData({ status, body }) {
  const K = "twelve-data";
  const N = "Twelve Data credits";
  if (status === 401 || status === 403) return action(K, N, `Twelve Data refused the key (HTTP ${status}).`, "Check TWELVE_DATA_API_KEY, in Vercel and in this repository's secrets.");
  if (status === 429) {
    // Twelve Data's message says which limit: the day's 800, or the minute's 8.
    const said = body?.message ? ` Twelve Data says: "${String(body.message).split(" Wait for")[0].slice(0, 200)}"` : "";
    const daily = /for the day/i.test(body?.message ?? "");
    return action(
      K,
      N,
      `${daily ? "The day's credits are used up" : "The credits are used up"} (HTTP 429).${said}`,
      daily
        ? "Prices fall back to Tiingo, and the alerts job can't price watched tickers, until midnight UTC. Find what is spending the credits: most likely crawlers opening research files for many companies, each costing a price request."
        : "Something is calling Twelve Data more than 8 times a minute.",
    );
  }
  if (status !== 200 || !body || body.status === "error") return action(K, N, `Twelve Data's usage endpoint answered HTTP ${status}${body?.message ? `: ${body.message}` : ""}.`, "Check twelvedata.com's status and the key.");
  const used = Number(body.daily_usage);
  const cap = Number(body.plan_daily_limit);
  if (!Number.isFinite(cap) || cap <= 0) return ok(K, N, `No daily cap on this plan (${body.plan_category ?? "unknown"}).`);
  const share = used / cap;
  const line = `${used} of ${cap} daily credits used today (${Math.round(share * 100)}%), resetting at midnight UTC.`;
  if (share >= WARN_SHARE) return action(K, N, line, "Something is spending Twelve Data credits fast; prices fall back to Tiingo when they run out.");
  return ok(K, N, line);
}

// —— Vercel usage (readable on Pro, not on Hobby) ——
export function toHours(quantity, unit) {
  const u = String(unit ?? "").toLowerCase();
  if (/(^|[^a-z])(hours?|hrs?|h)([^a-z]|$)/.test(u)) return quantity;
  if (/(^|[^a-z])(minutes?|mins?)([^a-z]|$)/.test(u)) return quantity / 60;
  if (/(milliseconds?|ms)([^a-z]|$)/.test(u)) return quantity / 3.6e6;
  if (/(^|[^a-z])(seconds?|secs?|s)([^a-z]|$)/.test(u)) return quantity / 3600;
  return null;
}

export function activeCpuHours(costs) {
  const products = costs?.results?.dimensionsMeta?.product?.values ?? {};
  const metrics = costs?.metrics ?? [];
  let hours = null;
  for (const r of costs?.results?.views?.byProduct?.results ?? []) {
    const product = r?.dimensionValues?.product;
    if (!product || !/active[\s_-]*cpu/i.test(`${products[product]?.title ?? ""} ${product}`)) continue;
    const q = (r.metrics ?? []).findIndex((m) => m !== "gross_cost");
    const metric = metrics.find((m) => m.slug === r.metrics?.[q]);
    const unit = metric?.unit?.kind === "custom" ? (metric.unit.plural ?? metric.unit.singular) : metric?.unit?.name;
    const h = toHours(Number(r.totalValue?.[q] ?? 0), unit);
    if (h != null) hours = (hours ?? 0) + h;
  }
  return hours;
}

export function judgeCpu(hours) {
  const K = "vercel-cpu";
  const N = "Vercel Active CPU";
  const line = `${hours.toFixed(2)} of ${CPU_LIMIT_HOURS} hours in the last 30 days (${Math.round((hours / CPU_LIMIT_HOURS) * 100)}%).`;
  if (hours / CPU_LIMIT_HOURS >= WARN_SHARE) return action(K, N, line, "Vercel pauses the account at the limit. Observability, Vercel Functions, sorted by Active CPU, shows what's using it.");
  return ok(K, N, line);
}

// —— Issues ——
export const ACTION_PREFIX = "Watcher:";
const plural = (n) => (n === 1 ? "1 thing needs attention" : `${n} things need attention`);

export function actionIssue(results, now = new Date()) {
  const failing = results.filter((r) => r.state === "action");
  const keys = failing.map((r) => r.key).sort().join(",");
  return {
    title: `${ACTION_PREFIX} ${plural(failing.length)}`,
    keys,
    body: [
      `The daily watcher found ${failing.length === 1 ? "one thing that needs" : `${failing.length} things that need`} action (${when(now.toISOString())}):`,
      "",
      ...failing.flatMap((r) => [`**${r.name}.** ${r.detail}`, `What to do: ${r.todo}`, ""]),
      "This issue is edited when the list changes, and closes itself when everything is clear.",
      `<!-- watcher:action ${keys} -->`,
    ].join("\n"),
  };
}

export function weeklySummary(results, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const mark = { ok: "ok", action: "NEEDS ACTION", skipped: "skipped" };
  return {
    title: `${ACTION_PREFIX} week of ${date}`,
    body: [
      `Weekly summary, ${when(now.toISOString())}.`,
      "",
      ...results.map((r) => `- ${r.name}: ${mark[r.state]}. ${r.detail}`),
      "",
      LIMITS_TEXT,
      "",
      "<!-- watcher:weekly -->",
    ].join("\n"),
  };
}

export function isWeeklyDay(now = new Date(), force = process.env.WATCHER_WEEKLY === "1") {
  return force || now.getUTCDay() === 1;
}

// —— Wiring ——
const DB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
// The public key: the same one every page of the site carries. It can read
// none of the jobs' tables; watcher_status() is the only thing it's for here.
const DB_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const guarded = readOnlyFetch(globalThis.fetch, DB_URL || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "dispatch-watcher" };

async function page(path) {
  try {
    const res = await guarded(SITE + path, { redirect: "follow", headers: UA, signal: AbortSignal.timeout(30_000) });
    return { status: res.status, body: await res.text(), cache: res.headers.get("x-vercel-cache"), vercelError: res.headers.get("x-vercel-error") ?? "" };
  } catch (err) {
    return { status: 0, body: "", cache: null, vercelError: "", error: err instanceof Error ? err.name : "error" };
  }
}

async function checkSite() {
  const tries = 3;
  const pause = Number(process.env.WATCHER_RETRY_MS ?? 30_000);
  let seen;
  let state;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(pause);
    seen = await page("/");
    state = classifySite(seen);
    if (state !== "down") break;
  }
  const detail = seen.status ? `HTTP ${seen.status}${seen.vercelError ? ` ${seen.vercelError}` : ""}` : `no answer (${seen.error})`;
  if (state === "ok") return ok("site", "Live site", `${SITE} answers (${detail}).`);
  if (state === "paused") return action("site", "Live site", `Vercel has paused the account's deployments (${detail}).`, "Vercel paused the account. Its Usage page shows which allowance went over; Vercel support (vercel.com/help) unpauses it.");
  return action("site", "Live site", `${SITE} didn't answer with a page ${tries} times (${detail}).`, "Check the Vercel dashboard and vercel-status.com.");
}

async function checkCache() {
  const misses = [];
  const seen = [];
  for (const path of ["/screener", "/screener/the-compounder"]) {
    let r = await page(path);
    if (!isCached(r.cache)) {
      await sleep(5000);
      r = await page(path);
    }
    seen.push(`${path} ${r.cache ?? "no cache header"}`);
    if (r.status !== 200 || !isCached(r.cache)) misses.push(`${path} answered HTTP ${r.status}, cache "${r.cache ?? "none"}"`);
  }
  if (misses.length) {
    return action("cache", "Cached pages", `${misses.join("; ")}.`, "These pages should come from Vercel's cache; a page rebuilt on every visit spends Active CPU (docs/cpu-budget/cpu-budget-recap.md). Check the latest build's route table.");
  }
  return ok("cache", "Cached pages", `Served from cache: ${seen.join(", ")}.`);
}

// Everything the watcher reads from the database is one call to
// watcher_status() (migration 0031), with the public key: five numbers about
// the jobs, and no table. A GET, as the read-only fetch requires (PostgREST
// serves stable functions over GET).
let statusOnce = null;
function dbStatus() {
  statusOnce ??= (async () => {
    const res = await guarded(`${DB_URL}/rest/v1/rpc/watcher_status`, {
      method: "GET",
      headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, ...UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return { missing: true };
    if (!res.ok) throw new Error(`watcher_status: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    return { status: await res.json() };
  })();
  return statusOnce;
}

async function needsDb(key, name) {
  if (!DB_URL || !DB_KEY) return skipped(key, name, "Needs SUPABASE_URL and SUPABASE_ANON_KEY (the public key).");
  if ((await dbStatus()).missing) return skipped(key, name, "Needs migration 0031 (watcher_status) pasted into Supabase.");
  return null;
}

async function checkScreenerJob() {
  const missing = await needsDb("screener-job", "Screener job");
  if (missing) return missing;
  const { status } = await dbStatus();
  return judgeScreenerJob(status.screener_run ?? null, status.screener_updated_at ?? null);
}

async function checkAlertsJob() {
  const missing = await needsDb("alerts-job", "Alerts job");
  if (missing) return missing;
  const { status } = await dbStatus();
  return judgeAlertsJob(status.alerts_checked_at ?? null, Number(status.watched_tickers ?? 0));
}

async function checkSupabase() {
  const missing = await needsDb("supabase", "Supabase");
  if (missing) return missing;
  const { status } = await dbStatus();
  return ok("supabase", "Supabase", `The database answers (${status.screener_medians ?? "some"} medians stored).`);
}

async function checkCounts() {
  const r = await page("/screener");
  if (r.status !== 200) return action("counts", "Screen counts", `/screener answered HTTP ${r.status}.`, "See the Live site check.");
  return judgeCounts(parseScreener(r.body));
}

async function checkTwelveData() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return skipped("twelve-data", "Twelve Data credits", "Needs TWELVE_DATA_API_KEY.");
  const res = await guarded("https://api.twelvedata.com/api_usage", { headers: { Authorization: `apikey ${key}`, ...UA }, signal: AbortSignal.timeout(20_000) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return judgeTwelveData({ status: body?.code && body.status === "error" ? Number(body.code) : res.status, body });
}

async function checkVercelCpu() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return skipped("vercel-cpu", "Vercel Active CPU", "Not readable on the Hobby plan (and no VERCEL_TOKEN).");
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 864e5);
  const res = await guarded(`https://api.vercel.com/v2/billing/costs?slug=${encodeURIComponent(process.env.VERCEL_SCOPE ?? "dispatchteam")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({ from: from.toISOString(), to: to.toISOString(), metrics: ["gross_cost", "quantity"], format: "timeseries", views: { byProduct: { groupBy: ["product"] } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status === 404 && /plan not found/i.test(text)) return skipped("vercel-cpu", "Vercel Active CPU", "Not readable on the Hobby plan: Vercel's billing API answers \"Plan not found\".");
  if (!res.ok) return skipped("vercel-cpu", "Vercel Active CPU", `Vercel's billing API answered HTTP ${res.status}.`);
  const hours = activeCpuHours(JSON.parse(text));
  if (hours == null) return skipped("vercel-cpu", "Vercel Active CPU", "Vercel's answer had no Active CPU line.");
  return judgeCpu(hours);
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...UA },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

async function fileIssues(results, now) {
  const open = (await github("/issues?state=open&per_page=100")).filter((i) => !i.pull_request && i.title.startsWith(ACTION_PREFIX) && i.user?.login === "github-actions[bot]");
  const actionOpen = open.find((i) => (i.body ?? "").includes("<!-- watcher:action"));
  const failing = results.filter((r) => r.state === "action");
  const notes = [];
  if (failing.length) {
    const issue = actionIssue(results, now);
    if (!actionOpen) {
      const created = await github("/issues", { method: "POST", body: JSON.stringify({ title: issue.title, body: issue.body }) });
      notes.push(`Opened ${created.html_url}`);
    } else {
      const was = /<!-- watcher:action ([^ ]*) -->/.exec(actionOpen.body ?? "")?.[1] ?? "";
      if (was !== issue.keys) {
        await github(`/issues/${actionOpen.number}`, { method: "PATCH", body: JSON.stringify({ title: issue.title, body: issue.body }) });
        await github(`/issues/${actionOpen.number}/comments`, { method: "POST", body: JSON.stringify({ body: `The list changed: ${failing.map((r) => r.name).join(", ")}.` }) });
        notes.push(`Updated ${actionOpen.html_url}`);
      } else notes.push(`Still open, unchanged: ${actionOpen.html_url}`);
    }
  } else if (actionOpen) {
    await github(`/issues/${actionOpen.number}/comments`, { method: "POST", body: JSON.stringify({ body: `All clear at ${when(now.toISOString())}: every check is ok or skipped.` }) });
    await github(`/issues/${actionOpen.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    notes.push(`Closed ${actionOpen.html_url}`);
  }
  if (isWeeklyDay(now)) {
    for (const old of open.filter((i) => (i.body ?? "").includes("<!-- watcher:weekly -->"))) {
      await github(`/issues/${old.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    }
    const summary = weeklySummary(results, now);
    const created = await github("/issues", { method: "POST", body: JSON.stringify(summary) });
    notes.push(`Weekly summary ${created.html_url}`);
  }
  return notes;
}

async function main() {
  const now = new Date();
  const checks = [checkSite, checkCache, checkScreenerJob, checkAlertsJob, checkCounts, checkSupabase, checkTwelveData, checkVercelCpu];
  const results = [];
  for (const check of checks) {
    try {
      results.push(await check());
    } catch (err) {
      const name = check.name.replace(/^check/, "");
      results.push(action(name.toLowerCase(), name, `The check itself failed: ${err instanceof Error ? err.message : err}`, "Read the watcher's run log on GitHub."));
    }
  }
  const lines = results.map((r) => `${r.state === "ok" ? "ok     " : r.state === "action" ? "ACTION " : "skipped"}  ${r.name}: ${r.detail}`);
  for (const l of lines) console.log(scrub(l));
  if (process.env.GITHUB_ACTIONS) {
    for (const r of results) console.log(scrub(`::notice title=${r.name} (${r.state})::${r.detail}`.replace(/\r?\n/g, " ")));
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, scrub(`${lines.map((l) => `- ${l}`).join("\n")}\n`));
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    for (const note of await fileIssues(results, now)) console.log(scrub(note));
  }
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "\0")) {
  main().catch((err) => {
    const message = scrub(err instanceof Error ? err.message : err);
    console.error(message);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Watcher failed::${message.replace(/\r?\n/g, " ")}`);
    process.exit(1);
  });
}
