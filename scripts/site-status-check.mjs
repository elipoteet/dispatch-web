// Hourly check that dispatchresearch.com is up, run by
// .github/workflows/site-status.yml.
//
// Why this and not a usage alert: Vercel's Hobby plan pauses the whole account
// when it goes over its free allowance (it did on 17 November 2026, at 13 h 53
// min of Active CPU against 4 hours), and a Hobby team can't read its usage
// through Vercel's API: POST /v2/billing/costs, which `vercel billing usage`
// calls, answers "Plan not found" (HTTP 404) for the dispatchteam team, and
// per-route metrics need the paid Observability Plus (checked 20 November
// 2026). So this can't warn before a pause; it says so within the hour.
//
// It opens a GitHub issue when the site shows Vercel's "Deployment Paused"
// answer, or doesn't answer three times a minute apart; GitHub emails the
// repository's owner. When the site is back it comments and closes the issue.
// The page it reads, the home page, is served from Vercel's cache, so the
// check itself costs no Active CPU.

import { appendFileSync } from "node:fs";

export const SITE = process.env.SITE_URL ?? "https://www.dispatchresearch.com/";
const TITLE_PREFIX = "dispatchresearch.com";
const TRIES = 3;
const PAUSE_MS = Number(process.env.RETRY_PAUSE_MS ?? 60_000);

// —— Pure ——

// "paused": Vercel's answer for a paused deployment (503 DEPLOYMENT_PAUSED).
// "down": anything else that isn't a page. "ok": a page.
export function classify({ status, vercelError = "", body = "" }) {
  if (/DEPLOYMENT_PAUSED/i.test(vercelError) || (status === 503 && /DEPLOYMENT_PAUSED/i.test(body))) return "paused";
  if (status >= 200 && status < 400) return "ok";
  return "down";
}

export function issueText(state, detail, when) {
  if (state === "paused") {
    return {
      title: `${TITLE_PREFIX} is paused by Vercel`,
      body: [
        `Vercel is answering dispatchresearch.com with "Deployment Paused" (checked ${when}: ${detail}).`,
        "",
        "That happens when the account goes over a Hobby allowance, usually Active CPU (4 hours a month). A paused Hobby account stays paused until Vercel support unpauses it, even after 30 days.",
        "",
        "What to do:",
        "1. Vercel dashboard, Usage: which allowance went over.",
        "2. Contact Vercel support to unpause: https://vercel.com/help",
        "3. Observability, Vercel Functions, sorted by Active CPU: what used it. docs/cpu-budget/cpu-budget-recap.md has the history.",
        "",
        "This issue closes itself when the site answers again.",
      ].join("\n"),
    };
  }
  return {
    title: `${TITLE_PREFIX} isn't answering`,
    body: [
      `dispatchresearch.com didn't answer with a page ${TRIES} times a minute apart (checked ${when}: ${detail}).`,
      "",
      "Check the Vercel dashboard (Deployments, and the project's status) and https://www.vercel-status.com.",
      "",
      "This issue closes itself when the site answers again.",
    ].join("\n"),
  };
}

// —— Wiring ——

async function look() {
  try {
    const res = await fetch(SITE, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "dispatch-site-status-check" } });
    const body = await res.text();
    const vercelError = res.headers.get("x-vercel-error") ?? "";
    return { status: res.status, vercelError, body, detail: `HTTP ${res.status}${vercelError ? ` ${vercelError}` : ""}` };
  } catch (err) {
    return { status: 0, vercelError: "", body: "", detail: `no answer (${err instanceof Error ? err.name : "error"})` };
  }
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "dispatch-site-status-check",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function openIssues() {
  const all = await github("/issues?state=open&per_page=100");
  return all.filter((i) => !i.pull_request && i.title.startsWith(TITLE_PREFIX) && i.user?.login === "github-actions[bot]");
}

async function main() {
  let seen = await look();
  let state = classify(seen);
  // A blip isn't news: a site that doesn't answer is tried again twice.
  for (let i = 1; i < TRIES && state === "down"; i++) {
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    seen = await look();
    state = classify(seen);
  }
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const line = `${SITE}: ${state} (${seen.detail}), ${when}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Site status::${line}`);
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return;

  const open = await openIssues();
  if (state === "ok") {
    for (const issue of open) {
      await github(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Back up: ${seen.detail} at ${when}.` }) });
      await github(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
      console.log(`Closed ${issue.html_url}`);
    }
    return;
  }
  const { title, body } = issueText(state, seen.detail, when);
  const same = open.find((i) => i.title === title);
  if (same) {
    console.log(`Already open: ${same.html_url}`);
    return;
  }
  const created = await github("/issues", { method: "POST", body: JSON.stringify({ title, body }) });
  console.log(`Opened ${created.html_url}`);
  // A failed run also makes GitHub email the owner, which a paused site deserves.
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "\0")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Site status check failed::${String(err instanceof Error ? err.message : err).replace(/\r?\n/g, " ")}`);
    process.exit(1);
  });
}
