import Link from "next/link";
import type { MonthStatus, PublicLeaderboardRow } from "@/lib/competition/publicBoard";
import { formatMonthLabel } from "@/lib/competition/publicBoard";

type Props = {
  month: string;
  isCurrent: boolean;
  status: MonthStatus | null;
  rows: PublicLeaderboardRow[];
  closedMonths: string[];
};

function rankRowClass(rank: number): string {
  if (rank === 1) return "l-top1";
  if (rank === 2) return "l-top2";
  if (rank === 3) return "l-top3";
  return "";
}

export function LeaderboardBoard({ month, isCurrent, status, rows, closedMonths }: Props) {
  const isClosed = status?.status === "closed";
  const monthLabel = formatMonthLabel(month);
  const otherClosedMonths = closedMonths.filter((m) => m !== month);

  return (
    <>
      <div className="leaderboard-head">
        <div className="label">Monthly Leaderboard</div>
        <h1>
          {monthLabel}
          {isCurrent && !isClosed && <span style={{ color: "var(--gold)" }}> · Live</span>}
        </h1>
        <p>
          A real monthly investing competition: every entrant trades a separate $10,000 paper
          account, scored once a day after the close. No real money changes hands, and no real
          prizes — this is a free feature, not a promotion.{" "}
          {isCurrent && (
            <>
              Want in? <Link href="/leaderboard?tab=account">Opt in and start trading →</Link>
            </>
          )}
        </p>
        <div className="leaderboard-stats">
          <div>
            <div className="leaderboard-stat-label">Entrants</div>
            <div className="leaderboard-stat-value">{rows.length}</div>
          </div>
          <div>
            <div className="leaderboard-stat-label">Status</div>
            <div className={`leaderboard-stat-value ${isClosed ? "" : "live"}`}>
              {isClosed ? "Final Standings" : status?.status === "closing" ? "Wrapping Up" : "Open"}
            </div>
          </div>
        </div>
      </div>

      {isClosed && status?.winnerHandle && (
        <div className="leaderboard-winner-banner">
          <span className="wb-label">Winner</span>
          <span className="wb-handle">@{status.winnerHandle}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="phase-stub">
          <div className="label">Monthly Leaderboard</div>
          <h2>
            {isCurrent ? "This month's competition is just getting started." : "No eligible entrants this month."}
          </h2>
          <p>
            {isCurrent
              ? "Be the first to opt in, choose a handle, and place a trade — standings are computed once a day after the market closes."
              : "Nobody met the eligibility bar this month, so there's no board to show."}
          </p>
          {isCurrent && (
            <Link
              className="auth-submit"
              style={{ marginTop: 20, width: "auto", padding: "12px 24px", display: "inline-block", textDecoration: "none" }}
              href="/leaderboard?tab=account"
            >
              Opt In
            </Link>
          )}
        </div>
      ) : (
        <div className="leaderboard-section">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Handle</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.handle} className={rankRowClass(r.rank)}>
                  <td className="l-rank">{r.rank}</td>
                  <td className="l-handle">@{r.handle}</td>
                  <td className={r.returnPct >= 0 ? "pos" : "neg"}>
                    {r.returnPct >= 0 ? "+" : "-"}
                    {Math.abs(r.returnPct).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {otherClosedMonths.length > 0 && (
        <div className="leaderboard-months">
          {otherClosedMonths.map((m) => (
            <Link key={m} href={`/leaderboard/${m}`}>
              {formatMonthLabel(m)}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
