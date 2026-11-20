// Daily check of Vercel Active CPU against the Hobby plan's 4 hours, run by
// .github/workflows/vercel-usage.yml. The account was paused on 17 November
// 2026 at 13 h 53 min, with no warning anyone saw first. Vercel lets only Pro
// teams set their own usage alert, so this one is ours: at 70% of the limit it
// opens a GitHub issue in this repository, and GitHub emails the owner. It
// comments on that issue again at 85% and 100%.
//
// Reads usage with the Vercel CLI (`vercel billing usage --json`), for the
// current billing period and for the last 30 days, and uses the larger. Needs
// VERCEL_TOKEN (a Vercel access token for the account) and, to file the
// issue, GITHUB_TOKEN and GITHUB_REPOSITORY, which Actions provides.
//
// If it can't find or read the Active CPU line, it fails: GitHub emails a
// failed scheduled run too, so a broken check is never silent.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const LIMIT_HOURS = Number(process.env.LIMIT_HOURS ?? 4);
export const BANDS = [0.7, 0.85, 1];
const CLI = "vercel@65.11.0";
const TITLE_PREFIX = "Vercel Active CPU at";

// —— Pure: reading the CLI's JSON ——

// Hours from a quantity in the unit Vercel's API names for it.
export function toHours(quantity, unit) {
  const u = String(unit ?? "").toLowerCase();
  if (/(^|[^a-z])(hours?|hrs?|h)([^a-z]|$)/.test(u)) return quantity;
  if (/(^|[^a-z])(minutes?|mins?)([^a-z]|$)/.test(u)) return quantity / 60;
  if (/(milliseconds?|ms)([^a-z]|$)/.test(u)) return quantity / 3.6e6;
  if (/(^|[^a-z])(seconds?|secs?|s)([^a-z]|$)/.test(u)) return quantity / 3600;
  return null;
}

// The Active CPU line: { name, product, quantity, unit, cost, included,
// category } in `services` (vercel@65.11.0, dist/chunks/usage-*.js,
// serializeService). Its name comes from Vercel's API, so it is matched
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
// workflow). Without it the CLI asks for the personal account's costs, which
// have nothing to show: HTTP 404 on the first scheduled run (19 November 2026).
const SCOPE = process.env.VERCEL_SCOPE?.trim() || null;

// Never print the token: it travels in VERCEL_TOKEN, which the CLI reads by
// itself, not on the command line (a failed command's message repeats its
// arguments), and anything the CLI prints is scrubbed of it before it is shown.
export function scrub(text) {
  const token = process.env.VERCEL_TOKEN;
  return token ? String(text).split(token).join("***") : String(text);
}

export function cliArgs(args, scope = SCOPE) {
  return ["--yes", CLI, "billing", "usage", ...args, ...(scope ? ["--scope", scope] : []), "--json", "--non-interactive"];
}

// The CLI's own JSON error ({ status, reason, message, data: { httpStatus } })
// as one line; failing that, the end of what it wrote to stderr, where it
// reports problems it hits before the command runs (a scope it can't use, for
// one), without colour codes. The caller scrubs the token from it.
export function cliFailure(stdout, stderr = "") {
  const said = String(stdout ?? "");
  const start = said.indexOf("{");
  if (start >= 0) {
    try {
      const j = JSON.parse(said.slice(start));
      return [j.reason, j.message, j.data?.httpStatus != null ? `HTTP ${j.data.httpStatus}` : null, j.hint].filter(Boolean).join(" | ");
    } catch {
      /* not JSON */
    }
  }
  const plain = (text) =>
    String(text ?? "")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^npm (warn|notice)/i.test(l))
      .join(" / ");
  return plain(said).slice(0, 300) || plain(stderr).slice(-400) || "no output";
}

function readUsage(args) {
  let out;
  try {
    out = execFileSync("npx", cliArgs(args), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (err) {
    const label = `vercel billing usage ${[...args, ...(SCOPE ? ["--scope", SCOPE] : [])].join(" ")}`.trim();
    throw new Error(scrub(`${label} failed (exit ${err.status ?? "?"}): ${cliFailure(err.stdout, err.stderr)}`));
  }
  // The JSON is the last thing printed; anything before it is the CLI's notices.
  const start = out.indexOf("{");
  if (start < 0) throw new Error(scrub(`The Vercel CLI printed no JSON: ${out.slice(0, 300)}`));
  return JSON.parse(out.slice(start));
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
  const readings = [];
  for (const [label, args] of [
    ["current period", []],
    ["last 30 days", ["--since", "30d"]],
  ]) {
    const cpu = activeCpu(readUsage(args));
    readings.push({ label, ...cpu });
    console.log(`${label}: ${formatHours(cpu.hours)} of Active CPU`);
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
