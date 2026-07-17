import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: accountRow } = await supabase
    .from("paper_account")
    .select("starting_cash")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!accountRow) {
    return NextResponse.json({ curve: [], startingCash: null });
  }

  const { data: rows, error } = await supabase
    .from("equity_snapshot")
    .select("snapshot_at, value, spy_price")
    .eq("user_id", user.id)
    .order("snapshot_at", { ascending: true })
    .limit(365);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const curve = (rows ?? []).map((r) => ({
    date: r.snapshot_at.slice(0, 10),
    value: Number(r.value),
    spyPrice: r.spy_price != null ? Number(r.spy_price) : null,
  }));

  return NextResponse.json({ curve, startingCash: Number(accountRow.starting_cash) });
}
