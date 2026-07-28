import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CompetitionSignedOut } from "@/components/competition/CompetitionSignedOut";
import { CompetitionDesk } from "@/components/competition/CompetitionDesk";

export const metadata: Metadata = {
  title: "Competition",
  robots: { index: false, follow: false },
};

export default async function CompetitionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <section className="page active" id="page-competition">
      <div className="portfolio-head">
        <div className="label">Monthly Leaderboard</div>
        <h1>Your Competition Account</h1>
        <p>
          A separate $10,000 paper account, reset every calendar month. Opt in, pick a handle, and
          trade during market hours to appear on the public{" "}
          <a href="/leaderboard">leaderboard</a>.
        </p>
      </div>

      {user ? <CompetitionDesk /> : <CompetitionSignedOut />}
    </section>
  );
}
