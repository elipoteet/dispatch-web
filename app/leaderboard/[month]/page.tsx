import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatMonthLabel,
  getClosedMonths,
  getLeaderboardRows,
  getMonthStatus,
  type MonthStatus,
} from "@/lib/competition/publicBoard";
import { nyMonthKey } from "@/lib/competition/marketHours";
import { LeaderboardBoard } from "@/components/leaderboard/LeaderboardBoard";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

type Props = { params: Promise<{ month: string }> };

// Validation + existence check only — notFound() here must always
// propagate as itself, so (matching app/research/[ticker]/page.tsx's
// resolveTicker) this deliberately has no try/catch around it.
async function resolveMonth(props: Props): Promise<{ month: string; status: MonthStatus }> {
  const { month } = await props.params;
  if (!MONTH_PATTERN.test(month)) notFound();
  const status = await getMonthStatus(month);
  if (!status) notFound();
  return { month, status };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { month } = await resolveMonth(props);
  return {
    title: `Monthly Leaderboard — ${formatMonthLabel(month)}`,
    alternates: { canonical: `/leaderboard/${month}` },
    openGraph: { url: `/leaderboard/${month}` },
  };
}

export default async function LeaderboardMonthPage(props: Props) {
  const { month, status } = await resolveMonth(props);
  const [rows, closedMonths] = await Promise.all([getLeaderboardRows(month), getClosedMonths()]);
  const isCurrent = month === nyMonthKey();

  return (
    <section className="page active" id="page-leaderboard">
      <LeaderboardBoard month={month} isCurrent={isCurrent} status={status} rows={rows} closedMonths={closedMonths} />
    </section>
  );
}
