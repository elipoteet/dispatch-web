"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { CompetitionDesk } from "@/components/competition/CompetitionDesk";
import { CompetitionSignedOut } from "@/components/competition/CompetitionSignedOut";
import type { MonthStatus, PublicLeaderboardRow } from "@/lib/competition/publicBoard";
import { LeaderboardBoard } from "./LeaderboardBoard";

type Tab = "board" | "account";

// The "My Account" tab only ever applies to the current month — there's
// no historical "my account for a past month" view, accounts only exist
// for whichever month is currently open — so archive pages
// (app/leaderboard/[month]/page.tsx for a non-current month) render the
// board alone, same as before this component existed.
export function LeaderboardTabs({
  month,
  isCurrent,
  status,
  rows,
  closedMonths,
}: {
  month: string;
  isCurrent: boolean;
  status: MonthStatus | null;
  rows: PublicLeaderboardRow[];
  closedMonths: string[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(isCurrent && searchParams.get("tab") === "account" ? "account" : "board");

  if (!isCurrent) {
    return (
      <LeaderboardBoard month={month} isCurrent={isCurrent} status={status} rows={rows} closedMonths={closedMonths} />
    );
  }

  // Tab choice lives in the URL (not just component state) so the "Opt in
  // and start trading" links elsewhere (LeaderboardBoard, the empty
  // state) can point at a real, shareable /leaderboard?tab=account URL
  // instead of a separate page.
  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "account") params.set("tab", "account");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <>
      <div className="portfolio-tabs" role="tablist">
        <button
          className={`portfolio-tab ${tab === "board" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          onClick={() => selectTab("board")}
        >
          Leaderboard
        </button>
        <button
          className={`portfolio-tab ${tab === "account" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "account"}
          onClick={() => selectTab("account")}
        >
          My Account
        </button>
      </div>

      {tab === "board" ? (
        <LeaderboardBoard month={month} isCurrent={isCurrent} status={status} rows={rows} closedMonths={closedMonths} />
      ) : user ? (
        <CompetitionDesk />
      ) : (
        <CompetitionSignedOut />
      )}
    </>
  );
}
