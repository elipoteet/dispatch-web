import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadPortfolioState } from "@/lib/portfolio";

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const state = await loadPortfolioState(supabase, user.id);
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: existing } = await supabase
    .from("paper_account")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Account already exists." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const startingCash = Number(body.startingCash);
  if (!Number.isFinite(startingCash) || startingCash < 100 || startingCash > 100_000_000) {
    return NextResponse.json({ error: "Starting cash must be between $100 and $100,000,000." }, { status: 400 });
  }

  const { error: insertError } = await supabase
    .from("paper_account")
    .insert({ user_id: user.id, starting_cash: startingCash, cash: startingCash });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase.from("equity_snapshot").insert({ user_id: user.id, value: startingCash, spy_price: null });

  const state = await loadPortfolioState(supabase, user.id);
  return NextResponse.json(state);
}

export async function DELETE() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  await Promise.all([
    supabase.from("paper_position").delete().eq("user_id", user.id),
    supabase.from("paper_transaction").delete().eq("user_id", user.id),
    supabase.from("equity_snapshot").delete().eq("user_id", user.id),
  ]);
  await supabase.from("paper_account").delete().eq("user_id", user.id);

  return NextResponse.json({ account: null, positions: [], transactions: [], summary: null });
}
