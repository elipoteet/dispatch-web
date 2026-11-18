// Preloaded into `next start` (or any Node script) with
// NODE_OPTIONS=--import=file:///<absolute path to this file>. Used to run the
// site locally against the live database without changing it, and to measure
// CPU per page (scripts/cpu/measure.mjs; docs/cpu-budget/cpu-budget-recap.md).
// 1. Write guard: any non-GET request to Supabase's data API (insert, upsert,
//    update, delete, RPC) is refused locally with a 403 and logged, so a local
//    server can read the live database but never change it. Sign-in calls to
//    /auth/v1 pass through.
// 2. CPU meter: each Node process that loads this file serves its own
//    process.cpuUsage() on a random local port, registered in CPU_REG_DIR, so
//    a measuring script can read the server's CPU time between requests.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";

const LOG = process.env.GUARD_LOG;
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const orig = globalThis.fetch;

function log(line) {
  if (LOG) appendFileSync(LOG, `${new Date().toISOString()} pid ${process.pid} ${line}\n`);
}

globalThis.fetch = async function guardedFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? String(input);
  const method = String(init?.method ?? (typeof input === "object" && input && "method" in input ? input.method : "GET")).toUpperCase();
  if (SB && url.startsWith(SB) && method !== "GET" && method !== "HEAD") {
    const path = url.slice(SB.length).split("?")[0];
    if (!path.startsWith("/auth/v1/")) {
      log(`BLOCKED ${method} ${path}`);
      return new Response(JSON.stringify({ message: "write blocked by local guard", code: "LOCAL_GUARD" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
  }
  return orig(input, init);
};

const REG = process.env.CPU_REG_DIR;
if (REG) {
  mkdirSync(REG, { recursive: true });
  let session = null;
  const server = http.createServer(async (req, res) => {
    // /prof-start and /prof-stop?file=… record a CPU profile of this process.
    if (req.url?.startsWith("/prof-start")) {
      const inspector = await import("node:inspector");
      session = new inspector.Session();
      session.connect();
      session.post("Profiler.enable", () => session.post("Profiler.start", () => res.end("started")));
      return;
    }
    if (req.url?.startsWith("/prof-stop") && session) {
      const file = new URL(req.url, "http://x").searchParams.get("file");
      session.post("Profiler.stop", (err, { profile }) => {
        writeFileSync(`${file}.${process.pid}.cpuprofile`, JSON.stringify(profile));
        session.disconnect();
        session = null;
        res.end("stopped");
      });
      return;
    }
    const u = process.cpuUsage();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ pid: process.pid, userUs: u.user, systemUs: u.system, rssMb: Math.round(process.memoryUsage().rss / 1e6) }));
  });
  server.unref();
  server.listen(0, "127.0.0.1", () => writeFileSync(`${REG}/${process.pid}.port`, String(server.address().port)));
}
log("guard loaded");
