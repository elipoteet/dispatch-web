// Daily check of Vercel Active CPU against the Hobby plan's 4 hours, run by
// .github/workflows/vercel-usage.yml. The account was paused on 17 November
// 2026 at 13 h 53 min, with no warning anyone saw first. Vercel lets only Pro
// teams set their own usage alert, so this one is ours: at 70% of the limit it
// opens a GitHub issue in this repository, and GitHub emails the owner. It
// comments on that issue again at 85% and 100%.
//
// Reads usage from Vercel's billing API for the team in VERCEL_SCOPE, for the
// last 30 days and for the team's billing period where the API gives one, and
// uses the larger. Needs VERCEL_TOKEN (a Vercel access token that can see the
// team) and, to file the issue, GITHUB_TOKEN and GITHUB_REPOSITORY, which
// Actions provides.
//
// If it can't find or read the Active CPU line, it fails: GitHub emails a
// failed scheduled run too, so a broken check is never silent.

import { appendFileSync } from "node:fs";

export const LIMIT_HOURS = Number(process.env.LIMIT_HOURS ?? 4);
export const BANDS = [0.7, 0.85, 1];
const TITLE_PREFIX = "Vercel Active CPU at";

// —— Pure: reading the usage rows ——

// Hours from a quantity in the unit Vercel's API names for it.
export function toHours(quantity, unit) {
  const u = String(unit ?? "").toLowerCase();
  if (/(^|[^a-z])(hours?|hrs?|h)([^a-z]|$)/.test(u)) return quantity;
  if (/(^|[^a-z])(minutes?|mins?)([^a-z]|$)/.test(u)) return quantity / 60;
  if (/(milliseconds?|ms)([^a-z]|$)/.test(u)) return quantity / 3.6e6;
  if (/(^|[^a-z])(seconds?|secs?|s)([^a-z]|$)/.test(u)) return quantity / 3600;
  return null;
}

// The Active CPU line: { name, product, quantity, unit } in `services`
// (servicesFromCosts). Its name comes from Vercel's API, so it is matched
// loosely ("Fluid Active CPU", "Active CPU", product "fluid_active_cpu").
export function activeCpu(usage) {
  const services = Array.isArray(usage?.services) ? usage.services : [];
  const rows = services.filter((s) => /active[\s_-]*cpu/i.test(`${s?.name ?? ""} ${s?.product ?? ""}`));
  if (rows.length === 0) throw new Error(`No Active CPU line in the usage report. Services seen: ${services.map((s) => s?.name).join(", ") || "none"}.`);
  let hours = 0;
  for (const row of rows) {
    const h = toHours(Number(row.quantity), row.unit);
    if (h == null || !Number.isFinite(h)) throw new Error(`Can't read the Active CPU line's unit: ${JSON.stringify(row)}`);
    hours += h;
  }
  return { hours, rows, period: usage?.period ?? null };
}

// The highest band reached, or null below the first.
export function bandFor(share) {
  let reached = null;
  for (const b of BANDS) if (share >= b) reached = b;
  return reached;
}

export function formatHours(h) {
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  return minutes === 60 ? `${whole + 1} h 0 min` : `${whole} h ${minutes} min`;
}

export function issueText({ hours, share, band, period }) {
  const pct = Math.round(share * 100);
  const title = `${TITLE_PREFIX} ${pct}% of the Hobby limit`;
  const body = [
    `Vercel's Active CPU for dispatchresearch.com is at **${formatHours(hours)}** of the Hobby plan's **${LIMIT_HOURS} hours** (${pct}%)${period?.from ? `, for ${String(period.from).slice(0, 10)} to ${String(period.to ?? "now").slice(0, 10)}` : ""}.`,
    "",
    band >= 1
      ? "That is the limit. Vercel pauses the whole account when it is exceeded, and a paused Hobby account stays paused until Vercel support unpauses it."
      : "Vercel pauses the whole account when the limit is exceeded, and a paused Hobby account stays paused until Vercel support unpauses it.",
    "",
    "What to look at, in this order:",
    "1. Vercel dashboard, Usage, Last 30 days: is Active CPU climbing day by day, or did one day jump?",
    "2. Observability, Vercel Functions, sorted by Active CPU: which routes are using it.",
    "3. Firewall, Rules, Bot Management: AI Crawlers should be on Deny.",
    "",
    `<!-- band:${band} -->`,
    "Checked by .github/workflows/vercel-usage.yml, once a day. It comments here again at 85% and 100%.",
  ].join("\n");
  return { title, body };
}

// —— Wiring ——

// The Vercel team the project belongs to (VERCEL_SCOPE, "dispatchteam" in the
// workflow), by its slug.
const SCOPE = process.env.VERCEL_SCOPE?.trim() || null;
const API = "https://api.vercel.com";

// Never print the token: anything shown is scrubbed of it first.
export function scrub(text) {
  const token = process.env.VERCEL_TOKEN;
  return token ? String(text).split(token).join("***") : String(text);
}

// Usage comes straight from Vercel's billing API, the endpoint `vercel billing
// usage` itself calls (vercel@65.11.0: POST /v2/billing/costs). The CLI was
// tried first and failed twice on GitHub's runner (19 and 20 November 2026):
// without a team it asked for the personal account's costs, and with
// --scope it first looks up the token's user, which Vercel answered with
// "User not found" (HTTP 404). The API needs only the team's ID.
async function vercel(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json", "User-Agent": "dispatch-usage-check" },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const why = json?.error ? [json.error.code, json.error.message].filter(Boolean).join(": ") : text.slice(0, 200);
    throw new Error(scrub(`Vercel API ${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${why}`));
  }
  return json;
}

// The team's ID and billing period, from the teams the token can see.
async function findTeam(slug) {
  const { teams = [] } = await vercel("/v2/teams?limit=100");
  const team = teams.find((t) => t.slug === slug || t.id === slug);
  if (!team) throw new Error(`The token can't see a Vercel team "${slug}". Teams it can see: ${teams.map((t) => t.slug).join(", ") || "none"}.`);
  return team;
}

// The costs response, turned into the rows activeCpu reads: one per product,
// with its display name, quantity and unit (as the CLI's processCosts and
// getQuantityUnits do).
export function servicesFromCosts(response) {
  const results = response?.results ?? {};
  const products = results.dimensionsMeta?.product?.values ?? {};
  const view = results.views?.byProduct?.results ?? [];
  const metrics = response?.metrics ?? [];
  return view
    .filter((r) => r?.dimensionValues?.product)
    .map((r) => {
      const product = r.dimensionValues.product;
      const qIndex = (r.metrics ?? []).findIndex((m) => m !== "gross_cost");
      const metric = metrics.find((m) => m.slug === r.metrics?.[qIndex]);
      const unit = metric?.unit?.kind === "custom" ? (metric.unit.plural ?? metric.unit.singular) : metric?.unit?.name;
      return {
        name: products[product]?.title ?? product,
        product,
        quantity: qIndex === -1 ? 0 : Number(r.totalValue?.[qIndex] ?? 0),
        unit: unit ?? metric?.title ?? "",
      };
    });
}

async function readUsage(team, from, to) {
  const costs = await vercel(`/v2/billing/costs?teamId=${encodeURIComponent(team.id)}`, {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      metrics: ["gross_cost", "quantity"],
      format: "timeseries",
      views: { byProduct: { groupBy: ["product"] } },
      userAgent: "dispatch-usage-check",
    }),
  });
  return { period: { from, to }, services: servicesFromCosts(costs) };
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "vercel-usage-check",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function alert({ hours, share, band, period }) {
  const { title, body } = issueText({ hours, share, band, period });
  const open = (await github("/issues?state=open&per_page=100")).filter((i) => !i.pull_request && i.title.startsWith(TITLE_PREFIX));
  const existing = open[0];
  if (!existing) {
    const created = await github("/issues", { method: "POST", body: JSON.stringify({ title, body }) });
    return `Opened ${created.html_url}`;
  }
  const last = Number(/<!-- band:([\d.]+) -->/.exec(existing.body ?? "")?.[1] ?? 0);
  if (band <= last) return `Already reported at ${Math.round(last * 100)}%: ${existing.html_url}`;
  await github(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ title, body }) });
  await github(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Now ${Math.round(share * 100)}%: ${formatHours(hours)} of ${LIMIT_HOURS} hours.` }) });
  return `Updated ${existing.html_url}`;
}

async function main() {
  if (!process.env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN is not set. Add it under the repository's Settings, Secrets and variables, Actions.");
  if (!SCOPE) throw new Error("VERCEL_SCOPE is not set: the Vercel team's slug (dispatchteam).");
  const team = await findTeam(SCOPE);
  const now = new Date();
  const windows = [["last 30 days", new Date(now.getTime() - 30 * 864e5), now]];
  // The team's own billing period, where the API gives one.
  const period = team.billing?.period;
  if (period?.start && period?.end) windows.unshift(["current period", new Date(period.start), new Date(Math.min(Number(new Date(period.end)), now.getTime()))]);
  const readings = [];
  for (const [label, from, to] of windows) {
    const usage = await readUsage(team, from.toISOString(), to.toISOString());
    const cpu = activeCpu(usage);
    readings.push({ label, ...cpu });
    console.log(`${label} (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}): ${formatHours(cpu.hours)} of Active CPU, from "${cpu.rows.map((r) => `${r.name}: ${r.quantity} ${r.unit}`).join("; ")}"`);
  }
  const worst = readings.reduce((a, b) => (b.hours > a.hours ? b : a));
  const share = worst.hours / LIMIT_HOURS;
  const band = bandFor(share);
  const line = `Active CPU: ${formatHours(worst.hours)} of ${LIMIT_HOURS} h (${Math.round(share * 100)}%), ${worst.label}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  // Also as an annotation on the run, readable from the run's page.
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Vercel Active CPU::${line}`);
  if (band == null) return;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error(`${line} Over ${Math.round(BANDS[0] * 100)}%, but there's no GitHub token to file the issue with.`);
  console.log(await alert({ hours: worst.hours, share, band, period: worst.period }));
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "\0")) {
  main().catch((err) => {
    const message = scrub(err instanceof Error ? err.message : err);
    console.error(message);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Vercel usage check failed::${message.replace(/\r?\n/g, " ")}`);
    process.exit(1);
  });
}
