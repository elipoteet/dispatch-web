// Server CPU per request, by route, on a production build (run npm run build
// first). Reads the live database through the site but never writes to it.
// Starts `next start` in <repo> on <port> with local-guard.mjs preloaded (no
// database writes; each process reports its own CPU), then for every URL
// sends one warm-up request and N measured ones, and reads the server's CPU
// time before and after. Windows counts CPU in 15.6 ms steps, so figures
// under about 20 ms are noise; on Vercel, cached pages cost nothing at all.
// Usage (PowerShell on Windows: Git Bash rewrites the /paths):
//   node scripts/cpu/measure.mjs <repo> <port> <out.json> [N] [routes.json] [settle ms]
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const [repo, port, out, nArg, routesFile, settleArg] = process.argv.slice(2);
const SETTLE = Number(settleArg ?? 1500);
const N = Number(nArg ?? 5);
// Scratch files (the CPU registry and the guard's log) go in the temp folder.
const SCR = (process.env.CPU_TMP ?? tmpdir()).split("\\").join("/");
const GUARD = new URL("./local-guard.mjs", import.meta.url).href;
const REG = `${SCR}/cpu-reg-${port}`;
const LOG = `${SCR}/guard-${port}.log`;
rmSync(REG, { recursive: true, force: true });
mkdirSync(REG, { recursive: true });
writeFileSync(LOG, "");

const env = {
  ...process.env,
  NODE_OPTIONS: `--import=${GUARD}`,
  GUARD_LOG: LOG,
  CPU_REG_DIR: REG,
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
let serverOut = "";
server.stdout.on("data", (d) => (serverOut += d));
server.stderr.on("data", (d) => (serverOut += d));

const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cpuMs() {
  let total = 0;
  for (const f of readdirSync(REG)) {
    const p = readFileSync(`${REG}/${f}`, "utf8");
    try {
      const r = await fetch(`http://127.0.0.1:${p}/`);
      const j = await r.json();
      total += (j.userUs + j.systemUs) / 1000;
    } catch {
      /* process gone */
    }
  }
  return total;
}

async function get(path, ua) {
  const t = Date.now();
  const r = await fetch(base + path, { redirect: "manual", headers: ua ? { "user-agent": ua } : {} });
  const body = await r.arrayBuffer();
  return { status: r.status, ms: Date.now() - t, bytes: body.byteLength };
}

for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base + "/robots.txt")).ok) break;
  } catch {
    /* not up yet */
  }
  await sleep(1000);
}
await sleep(1500);

const DEFAULT_ROUTES = [
  ["/", "home"],
  ["/about", "about"],
  ["/give", "give"],
  ["/research", "research index"],
  ["/screener", "screener opening page"],
  ["/screener/the-compounder", "a starting screen (29 rows)"],
  ["/screener/more-cash-than-debt", "a starting screen (141 rows)"],
  ["/screener?revenue=100m..&edit=1", "build your own (50 rows, panel open)"],
  ["/screener?revenue=500m..&roic=25..&sort=growth1y&order=asc", "a custom screen with a sort"],
  ["/screener?revenue=100m..&show=500", "500 rows"],
  ["/research/nvda", "research overview (NVIDIA)"],
  ["/research/nvda/financials", "research financials"],
  ["/research/nvda/valuation", "research valuation"],
  ["/research/nvda/earnings", "research earnings"],
  ["/research/nvda/insiders", "research insiders"],
  ["/research/nvda/filings", "research filings"],
  ["/research/hrmy", "research overview (Harmony Biosciences)"],
  ["/research/hrmy/insiders", "research insiders (Harmony)"],
  ["/api/search?q=app", "search box"],
  ["/wp-login.php", "a bot probe (404)"],
  ["/robots.txt", "robots.txt (static file, proxy runs)"],
];

const ROUTES = routesFile ? JSON.parse(readFileSync(routesFile, "utf8")) : DEFAULT_ROUTES;
const results = [];
for (const [path, label] of ROUTES) {
  const warm = await get(path);
  await sleep(SETTLE); // let any after() work from the warm-up finish
  const before = await cpuMs();
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(await get(path));
  await sleep(SETTLE);
  const after = await cpuMs();
  const cpu = (after - before) / N;
  const wall = runs.reduce((s, r) => s + r.ms, 0) / N;
  results.push({ path, label, status: runs[0].status, warmStatus: warm.status, warmMs: warm.ms, cpuMsPerRequest: Math.round(cpu), wallMs: Math.round(wall), kb: Math.round(runs[0].bytes / 1024) });
  console.log(`${String(Math.round(cpu)).padStart(6)} ms CPU  ${String(Math.round(wall)).padStart(6)} ms wall  ${runs[0].status}  ${label}  ${path}`);
}

// A crawler's first visit to a company the site hasn't stored: blocked writes
// mean every visit repeats the first-visit path. The guard log shows the writes
// that were refused, which proves the path ran.
writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), repo, N, results }, null, 1));
const blocked = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes("BLOCKED"));
console.log(`writes refused by the guard: ${blocked.length}`);
for (const b of [...new Set(blocked.map((l) => l.replace(/^.*BLOCKED /, "")))].slice(0, 12)) console.log("   ", b);
server.kill();
await sleep(1000);
if (existsSync(REG)) rmSync(REG, { recursive: true, force: true });
process.exit(0);
