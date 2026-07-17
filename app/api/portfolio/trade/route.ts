import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLatestPrice, loadPortfolioState, upsertTodayEquitySnapshot } from "@/lib/portfolio";

// Executes a buy/sell server-side. The client sends only {ticker, side,
// shares} — never a price. Price is looked up here, from our own provider
// proxy, so there's nothing for a modified request to tamper with.
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

  const { data: accountRow } = await supabase
    .from("paper_account")
    .select("cash")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!accountRow) {
    return NextResponse.json({ error: "Open a paper account first." }, { status: 400 });
  }
  const cash = Number(accountRow.cash);

  let price: number;
  try {
    price = await getLatestPrice(ticker);
  } catch {
    return NextResponse.json({ error: `Could not get a live price for ${ticker}.` }, { status: 502 });
  }

  const value = shares * price;

  const { data: positionRow } = await supabase
    .from("paper_position")
    .select("shares, avg_cost")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .maybeSingle();

  if (side === "buy") {
    if (value > cash) {
      return NextResponse.json(
        { error: `Insufficient cash. Order would cost $${value.toFixed(2)} but only $${cash.toFixed(2)} available.` },
        { status: 400 },
      );
    }
    const existingShares = positionRow ? Number(positionRow.shares) : 0;
    const existingAvgCost = positionRow ? Number(positionRow.avg_cost) : 0;
    const newShares = existingShares + shares;
    const newAvgCost = (existingShares * existingAvgCost + shares * price) / newShares;

    const { error: posError } = await supabase
      .from("paper_position")
      .upsert(
        { user_id: user.id, ticker, shares: newShares, avg_cost: newAvgCost },
        { onConflict: "user_id,ticker" },
      );
    if (posError) return NextResponse.json({ error: posError.message }, { status: 500 });

    const { error: cashError } = await supabase
      .from("paper_account")
      .update({ cash: cash - value })
      .eq("user_id", user.id);
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
        .from("paper_position")
        .delete()
        .eq("user_id", user.id)
        .eq("ticker", ticker);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    } else {
      const { error: posError } = await supabase
        .from("paper_position")
        .update({ shares: remaining })
        .eq("user_id", user.id)
        .eq("ticker", ticker);
      if (posError) return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    const { error: cashError } = await supabase
      .from("paper_account")
      .update({ cash: cash + value })
      .eq("user_id", user.id);
    if (cashError) return NextResponse.json({ error: cashError.message }, { status: 500 });
  }

  await supabase.from("paper_transaction").insert({ user_id: user.id, ticker, side, shares, price });

  const state = await loadPortfolioState(supabase, user.id);
  if (state.summary) {
    await upsertTodayEquitySnapshot(supabase, user.id, state.summary.totalValue);
  }

  return NextResponse.json({
    ...state,
    message: `${side === "buy" ? "Bought" : "Sold"} ${shares} share${shares === 1 ? "" : "s"} of ${ticker} @ $${price.toFixed(2)}`,
  });
}
