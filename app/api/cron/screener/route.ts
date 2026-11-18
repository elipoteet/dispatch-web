import { NextResponse } from "next/server";
import { refuseCron } from "@/lib/cron";
import { runScreenerJob } from "@/lib/screener/job";
import { refreshScreenerPages } from "@/lib/screener/revalidate";

// The screener's nightly refresh (lib/screener/job.ts). A second daily cron
// beside /api/cron/alerts, which keeps its own minute (vercel.json). Five
// minutes is the most a function may run on the Hobby plan with Fluid Compute
// (on for this project, Eli, 5 November 2026); the job works to a budget
// inside that and carries anything unfinished to the next night.
export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 280_000;

export async function GET(request: Request) {
  const refused = refuseCron(request);
  if (refused) return refused;
  const summary = await runScreenerJob({
    startedAt: Date.now(),
    budgetMs: BUDGET_MS,
    today: new Date().toISOString().slice(0, 10),
  });
  // The cached screener pages show tonight's figures from the next visit on.
  if (!summary.error && summary.companies.published != null) refreshScreenerPages();
  console.log("[cron/screener]", JSON.stringify(summary));
  return NextResponse.json(summary, { status: summary.error ? 500 : 200 });
}
