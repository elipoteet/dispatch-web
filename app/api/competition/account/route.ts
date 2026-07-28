import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nyMonthKey } from "@/lib/competition/marketHours";
import { loadCompetitionState } from "@/lib/competition/trading";

// Read-only — there's no manual create/reset here the way there is for
// paper_account. A competition account either doesn't exist yet (the user
// hasn't traded this month) or exists exactly as the trade route created
// it; nothing to onboard or wipe.
export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const month = nyMonthKey();
  const state = await loadCompetitionState(supabase, user.id, month);

  // The user's own daily-participation history and latest standing — read
  // directly (RLS already scopes "select own row" on
  // competition_daily_standing, same policy the private per-user reads
  // everywhere else in this feature rely on). Returned so /competition can
  // explain eligibility by calling the exact same checkEligibility()
  // (lib/competition/rules.ts) the snapshot cron itself runs, rather than
  // duplicating the thresholds as copy that could drift from enforcement.
  const { data: standingRows } = await supabase
    .from("competition_daily_standing")
    .select("snapshot_date, invested_ratio, rank, eligible")
    .eq("user_id", user.id)
    .eq("month", month)
    .order("snapshot_date", { ascending: true });

  const dailyParticipation = (standingRows ?? []).map((r) => ({ investedRatio: Number(r.invested_ratio) }));
  const latest = standingRows && standingRows.length > 0 ? standingRows[standingRows.length - 1] : null;
  const standing = latest
    ? { snapshotDate: latest.snapshot_date as string, rank: latest.rank as number | null, eligible: latest.eligible as boolean }
    : null;

  return NextResponse.json({ month, ...state, dailyParticipation, standing });
}
