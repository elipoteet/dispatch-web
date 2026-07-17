import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const MAX_WATCH = 8;

function isValidTicker(t: unknown): t is string {
  return typeof t === "string" && /^[A-Z.\-]{1,10}$/.test(t);
}

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_WATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickers: data.map((r) => r.ticker) });
}

export async function POST(request: Request) {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!isValidTicker(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  const { error: upsertError } = await supabase
    .from("watchlist")
    .upsert(
      { user_id: user.id, ticker, created_at: new Date().toISOString() },
      { onConflict: "user_id,ticker" },
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Enforce the same "8 most recent" cap the original localStorage version had.
  const { data: all, error: listError } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const overflowIds = all.slice(MAX_WATCH).map((r) => r.id);
  if (overflowIds.length) {
    await supabase.from("watchlist").delete().eq("user_id", user.id).in("id", overflowIds);
  }

  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_WATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickers: data.map((r) => r.ticker) });
}

export async function DELETE(request: Request) {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidTicker(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }

  const { error } = await supabase.from("watchlist").delete().eq("user_id", user.id).eq("ticker", ticker);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data, error: listError } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_WATCH);
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
  return NextResponse.json({ tickers: data.map((r) => r.ticker) });
}
