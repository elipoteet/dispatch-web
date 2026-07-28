import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSubscriber } from "@/lib/subscription";

const LIMIT = 20;

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ events: [] });

  // App-layer gate, redundant with but distinct from the alert_event RLS
  // policy (supabase/migrations/0002_alerts.sql) — belt-and-braces, same as
  // elsewhere in this app.
  if (!(await requireSubscriber(user.id))) return NextResponse.json({ events: [] });

  // Request-scoped client (not service-role) so RLS actually applies here —
  // the policy itself does the per-user fan-out via the caller's watchlist.
  const { data, error } = await supabase
    .from("alert_event")
    .select("id, ticker, type, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
