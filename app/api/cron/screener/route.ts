import { NextResponse } from "next/server";
import { runScreenerJob } from "@/lib/screener/job";

// The screener's nightly refresh (lib/screener/job.ts). A second daily cron
// beside /api/cron/alerts, which keeps its own minute (vercel.json). Five
// minutes is the most a function may run on the Hobby plan with Fluid Compute
// (on for this project, Eli, 5 November 2026); the job works to a budget
// inside that and carries anything unfinished to the next night.
export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 280_000;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Test only (Stage B): ?pauseBeforePublish=<seconds> holds the run between
  // staging and publishing, to show a run cut off there changes nothing
  // anyone can see. Removed once tested.
  const pause = Number(new URL(request.url).searchParams.get("pauseBeforePublish") ?? 0);
  const summary = await runScreenerJob({
    startedAt: Date.now(),
    budgetMs: BUDGET_MS,
    today: new Date().toISOString().slice(0, 10),
    pauseBeforePublishMs: Number.isFinite(pause) && pause > 0 ? Math.min(pause, 300) * 1000 : undefined,
  });
  console.log("[cron/screener]", JSON.stringify(summary));
  return NextResponse.json(summary, { status: summary.error ? 500 : 200 });
}
