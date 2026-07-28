import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const LIMIT = 20;

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ events: [] });

  // Alerts are free for every signed-in user — no entitlement gate. The
  // request-scoped client (not service-role) means RLS still applies here:
  // the alert_event policy scopes results to tickers on the caller's own
  // watchlist, so this is the whole per-user fan-out.
  const { data, error } = await supabase
    .from("alert_event")
    .select("id, ticker, type, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
