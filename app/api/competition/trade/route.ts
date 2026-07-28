import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLatestPrice } from "@/lib/portfolio";
import { isMarketOpen, nyMonthKey } from "@/lib/competition/marketHours";
import { STARTING_BALANCE } from "@/lib/competition/rules";
import { loadCompetitionState } from "@/lib/competition/trading";

// Executes a competition buy/sell server-side — same rigor as
// app/api/portfolio/trade/route.ts (integer shares, cash-only, no
// shorting, price looked up here rather than trusted from the client),
// plus two checks that only apply to the competition path: the market
// must actually be open, and the user must have opted in with a handle.
// None of this changes lib/portfolio.ts or the existing paper-trading
// route in any way.
export async function POST(request: Request) {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const side = body.side === "buy" || body.side === "sell" ? body.side : null;
  const shares = Number(body.shares);

  if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
  }
  if (!side) return NextResponse.json({ error: "side must be 'buy' or 'sell'." }, { status: 400 });
  if (!Number.isInteger(shares) || shares <= 0) {
    return NextResponse.json({ error: "Enter a positive number of shares." }, { status: 400 });
  }

  if (!isMarketOpen()) {
    return NextResponse.json(
      {
        error:
          "The market is closed. Competition trades can only be placed 9:30am–4:00pm ET on trading days.",
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("competition_profile")
    .select("opted_in, handle")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.opted_in || !profile.handle) {
    return NextResponse.json(
      { error: "Opt in and choose a handle before placing a competition trade." },
      { status: 400 },
    );
  }

  const month = nyMonthKey();

  // The competition account is created lazily, on this user's first trade
  // of the month — never by a separate onboarding step, and never wiped
  // or reset by a job (see supabase/migrations/0003_leaderboard.sql).
  const { data: existingAccount } = await supabase
    .from("competition_account")
    .select("cash")
    .eq("user_id", user.id)
    .eq("month", month)
    .maybeSingle();

  let cash: number;
  if (existingAccount) {
    cash = Number(existingAccount.cash);
  } else {
    const { error: createError } = await supabase
      .from("competition_account")
      .insert({ user_id: user.id, month, starting_balance: STARTING_BALANCE, cash: STARTING_BALANCE });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    cash = STARTING_BALANCE;
  }

  let price: number;
  try {
    price = await getLatestPrice(ticker);
  } catch {
    return NextResponse.json({ error: `Could not get a live price for ${ticker}.` }, { status: 502 });
  }

  const value = shares * price;

  const { data: positionRow } = await supabase
    .from("competition_position")
    .select("shares, avg_cost")
    .eq("user_id", user.id)
    .eq("month", month)
    .eq("ticker", ticker)
    .maybeSingle();

  if (side === "buy") {
    if (value > cash) {
      return NextResponse.json(
        {
          error: `Insufficient cash. Order would cost $${value.toFixed(2)} but only $${cash.toFixed(2)} available.`,
        },
        { status: 400 },
      );
    }
    const existingShares = positionRow ? Number(positionRow.shares) : 0;
    const existingAvgCost = positionRow ? Number(positionRow.avg_cost) : 0;
    const newShares = existingShares + shares;
    const newAvgCost = (existingShares * existingAvgCost + shares * price) / newShares;

    const { error: posError } = await supabase
      .from("competition_position")
      .upsert(
        { user_id: user.id, month, ticker, shares: newShares, avg_cost: newAvgCost },
        { onConflict: "user_id,month,ticker" },
      );
    if (posError) return NextResponse.json({ error: posError.message }, { status: 500 });

    const { error: cashError } = await supabase
      .from("competition_account")
      .update({ cash: cash - value })
      .eq("user_id", user.id)
      .eq("month", month);
    if (cashError) return NextResponse.json({ error: cashError.message }, { status: 500 });
  } else {
    const ownedShares = positionRow ? Number(positionRow.shares) : 0;
    if (!positionRow || ownedShares < shares) {
      return NextResponse.json(
        { error: `Insufficient shares. You own ${ownedShares} of ${ticker}.` },
        { status: 400 },
      );
    }
    const remaining = ownedShares - shares;
    if (remaining === 0) {
      const { error: delError } = await supabase
        .from("competition_position")
        .delete()
        .eq("user_id", user.id)
        .eq("month", month)
        .eq("ticker", ticker);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    } else {
      const { error: posError } = await supabase
        .from("competition_position")
        .update({ shares: remaining })
        .eq("user_id", user.id)
        .eq("month", month)
        .eq("ticker", ticker);
      if (posError) return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    const { error: cashError } = await supabase
      .from("competition_account")
      .update({ cash: cash + value })
      .eq("user_id", user.id)
      .eq("month", month);
    if (cashError) return NextResponse.json({ error: cashError.message }, { status: 500 });
  }

  await supabase.from("competition_trade").insert({ user_id: user.id, month, ticker, side, shares, price });

  // Recorded once, for tie-breaking ranked entrants with equal returns
  // (earlier first trade wins). The `.is("first_trade_at", null)` guard
  // means this is a no-op on every trade after the first.
  await supabase
    .from("competition_account")
    .update({ first_trade_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("month", month)
    .is("first_trade_at", null);

  const state = await loadCompetitionState(supabase, user.id, month);

  return NextResponse.json({
    ...state,
    message: `${side === "buy" ? "Bought" : "Sold"} ${shares} share${shares === 1 ? "" : "s"} of ${ticker} @ $${price.toFixed(2)}`,
  });
}
