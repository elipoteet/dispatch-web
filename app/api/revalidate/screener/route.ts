import { NextResponse } from "next/server";
import { refuseCron } from "@/lib/cron";
import { refreshScreenerPages } from "@/lib/screener/revalidate";

// Refreshes the cached screener pages after a job run that didn't go through
// /api/cron/screener (one started by hand, outside Vercel). Same secret as the
// crons, and production only.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const refused = refuseCron(request);
  if (refused) return refused;
  refreshScreenerPages();
  return NextResponse.json({ refreshed: ["/screener", "/screener/[screen]"] });
}
