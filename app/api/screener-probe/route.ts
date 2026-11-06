// TEMPORARY, phase eleven Stage A only: measures a screener refresh on Vercel
// itself, then is deleted in the next commit. Writes nothing anywhere.
//
//   GET /api/screener-probe?mode=frames&concurrency=4&profiles=200
//       runs the full frames download, assembly and metrics, plus a sample of
//       company profiles one at a time, and reports timings and memory
//   GET /api/screener-probe?mode=sleep&seconds=290
//       waits, to show how long a function may actually run here
//
// Behind CRON_SECRET, like the alerts cron, so a visitor can't set off a few
// hundred SEC requests.
import { NextResponse } from "next/server";
import { fetchFilerProfile, fetchFrame, fetchTickerExchangeFile } from "@/lib/sec/client";
import { framePlan } from "@/lib/sec/frames";
import { assembleCompany, collectFrame, type FrameCollection } from "@/lib/screener/assemble";
import { computeMetrics } from "@/lib/screener/metrics";
import { tickerByCik } from "@/lib/screener/tickers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const started = Date.now();

  if (url.searchParams.get("mode") === "sleep") {
    const seconds = Math.min(295, Math.max(1, Number(url.searchParams.get("seconds") ?? 60)));
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return NextResponse.json({ slept: seconds, elapsed: (Date.now() - started) / 1000 });
  }

  const concurrency = Math.min(8, Math.max(1, Number(url.searchParams.get("concurrency") ?? 4)));
  const profileSample = Math.min(500, Math.max(0, Number(url.searchParams.get("profiles") ?? 0)));
  const today = new Date().toISOString().slice(0, 10);
  const plan = framePlan(today, "full");
  const collection: FrameCollection = new Map();
  let found = 0;
  let bytes = 0;
  let failed = 0;
  let peakRss = process.memoryUsage().rss;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < plan.length) {
        const req = plan[next++];
        try {
          const got = await fetchFrame(req.tag, req.unit, req.period);
          if (got) {
            found++;
            bytes += got.bytes;
            collectFrame(collection, req.tag, got.frame);
          }
        } catch {
          failed++;
        }
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }
    }),
  );
  const framesSeconds = (Date.now() - started) / 1000;

  const t1 = Date.now();
  const listed = tickerByCik(await fetchTickerExchangeFile());
  let companies = 0;
  for (const company of collection.values()) {
    if (!listed.has(company.cik)) continue;
    const result = assembleCompany(company, today);
    if (!result.ok) continue;
    computeMetrics(result.company, "operating");
    companies++;
  }
  const assembleSeconds = (Date.now() - t1) / 1000;

  const t2 = Date.now();
  let profiles = 0;
  for (const cik of [...listed.keys()].slice(0, profileSample)) {
    try {
      await fetchFilerProfile(String(cik));
      profiles++;
    } catch {
      // counted by what's missing from `profiles`
    }
  }
  const profileSeconds = (Date.now() - t2) / 1000;

  return NextResponse.json({
    today,
    concurrency,
    frames: { requested: plan.length, found, failed, rawMB: +(bytes / 1_048_576).toFixed(1), seconds: framesSeconds },
    companies,
    assembleSeconds,
    profiles: { requested: profileSample, fetched: profiles, seconds: profileSeconds, perProfile: profiles ? profileSeconds / profiles : null },
    peakRssMB: Math.round(peakRss / 1_048_576),
    totalSeconds: (Date.now() - started) / 1000,
    region: process.env.VERCEL_REGION ?? null,
  });
}
