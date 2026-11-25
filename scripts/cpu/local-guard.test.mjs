// The local write guard: no request but a read reaches the database, even when
// the database's address only arrives after the guard has loaded, which is
// what `next start` does with .env.local.
import { afterAll, describe, expect, it, vi } from "vitest";

const real = globalThis.fetch;
const passedThrough = vi.fn(async () => new Response("[]", { status: 200 }));
globalThis.fetch = passedThrough;
const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
await import("./local-guard.mjs");

afterAll(() => {
  globalThis.fetch = real;
  if (saved !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
});

describe("the local write guard", () => {
  it("refuses a write to any Supabase host when no address is set yet", async () => {
    const res = await fetch("https://abcdefgh.supabase.co/rest/v1/watchlist", { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
    expect(passedThrough).not.toHaveBeenCalled();
  });

  it("refuses a write to the address set after it loaded, including RPCs", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test";
    for (const [path, method] of [
      ["/rest/v1/ticker_snapshot?on_conflict=ticker", "POST"],
      ["/rest/v1/sec_financials?cik=eq.1", "DELETE"],
      ["/rest/v1/sec_company", "PATCH"],
      ["/rest/v1/rpc/claim_price_credit", "POST"],
    ]) {
      expect((await fetch(`https://db.example.test${path}`, { method })).status).toBe(403);
    }
    expect(passedThrough).not.toHaveBeenCalled();
  });

  it("lets reads, sign-in calls and other hosts through", async () => {
    await fetch("https://db.example.test/rest/v1/watchlist?select=ticker");
    await fetch("https://db.example.test/auth/v1/token", { method: "POST" });
    await fetch("https://api.twelvedata.com/time_series?symbol=AAPL");
    expect(passedThrough).toHaveBeenCalledTimes(3);
  });
});
