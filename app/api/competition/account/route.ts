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
  return NextResponse.json({ month, ...state });
}
