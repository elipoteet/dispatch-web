import type { Metadata } from "next";
import { getClosedMonths, getLeaderboardRows, getMonthStatus } from "@/lib/competition/publicBoard";
import { nyMonthKey } from "@/lib/competition/marketHours";
import { LeaderboardTabs } from "@/components/leaderboard/LeaderboardTabs";

export const metadata: Metadata = {
  title: "Monthly Leaderboard",
  description:
    "A free monthly investing competition on The Dispatch — every entrant trades a separate $10,000 paper account, scored once a day after the close.",
  alternates: { canonical: "/leaderboard" },
  openGraph: { url: "/leaderboard" },
};

export default async function LeaderboardPage() {
  const month = nyMonthKey();
  const [rows, status, closedMonths] = await Promise.all([
    getLeaderboardRows(month),
    getMonthStatus(month),
    getClosedMonths(),
  ]);

  return (
    <section className="page active" id="page-leaderboard">
      <LeaderboardTabs month={month} isCurrent status={status} rows={rows} closedMonths={closedMonths} />
    </section>
  );
}
