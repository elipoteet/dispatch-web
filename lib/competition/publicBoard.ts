// Monthly Leaderboard — data access for the public /leaderboard pages.
// Reads only ever go through the public_* views (0003_leaderboard.sql),
// never competition_daily_standing directly and never a live provider
// call — the board only ever shows what the daily scoring cron already
// computed and stored.

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/service";

export type PublicLeaderboardRow = {
  month: string;
  snapshotDate: string;
  rank: number;
  handle: string;
  returnPct: number;
};

export type MonthStatus = {
  month: string;
  status: "open" | "closing" | "closed";
  winnerHandle: string | null;
  finalizedAt: string | null;
};

// Pure — given every public_leaderboard row for a month (one row per
// entrant per day this month), returns just the most recent day's rows,
// sorted by rank. Split out from the DB read so it's unit-testable without
// a database.
export function pickLatestSnapshot(
  rows: { snapshotDate: string; rank: number; handle: string; returnPct: number }[],
): { snapshotDate: string; rank: number; handle: string; returnPct: number }[] {
  if (rows.length === 0) return [];
  const latestDate = rows.reduce((max, r) => (r.snapshotDate > max ? r.snapshotDate : max), rows[0].snapshotDate);
  return rows.filter((r) => r.snapshotDate === latestDate).sort((a, b) => a.rank - b.rank);
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const REVALIDATE_S = 60;

const cachedGetLeaderboardRows = unstable_cache(
  async (month: string): Promise<PublicLeaderboardRow[]> => {
    const db = createPublicClient();
    const { data } = await db
      .from("public_leaderboard")
      .select("month, snapshot_date, rank, handle, return_pct")
      .eq("month", month);
    const rows = (data ?? []).map((r) => ({
      snapshotDate: r.snapshot_date as string,
      rank: r.rank as number,
      handle: r.handle as string,
      returnPct: Number(r.return_pct),
    }));
    return pickLatestSnapshot(rows).map((r) => ({ month, ...r }));
  },
  ["leaderboard-rows"],
  { revalidate: REVALIDATE_S },
);
export async function getLeaderboardRows(month: string): Promise<PublicLeaderboardRow[]> {
  return cachedGetLeaderboardRows(month);
}

const cachedGetMonthStatus = unstable_cache(
  async (month: string): Promise<MonthStatus | null> => {
    const db = createPublicClient();
    const { data } = await db
      .from("public_month_status")
      .select("month, status, winner_handle, finalized_at")
      .eq("month", month)
      .maybeSingle();
    if (!data) return null;
    return {
      month: data.month,
      status: data.status,
      winnerHandle: data.winner_handle,
      finalizedAt: data.finalized_at,
    };
  },
  ["leaderboard-month-status"],
  { revalidate: REVALIDATE_S },
);
export async function getMonthStatus(month: string): Promise<MonthStatus | null> {
  return cachedGetMonthStatus(month);
}

const cachedGetClosedMonths = unstable_cache(
  async (): Promise<string[]> => {
    const db = createPublicClient();
    const { data } = await db
      .from("public_month_status")
      .select("month")
      .eq("status", "closed")
      .order("month", { ascending: false });
    return (data ?? []).map((r) => r.month as string);
  },
  ["leaderboard-closed-months"],
  { revalidate: REVALIDATE_S },
);
export async function getClosedMonths(): Promise<string[]> {
  return cachedGetClosedMonths();
}
