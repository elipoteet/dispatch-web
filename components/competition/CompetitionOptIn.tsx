"use client";

import { useState } from "react";
import {
  MIN_DISTINCT_TICKERS,
  MIN_INVESTED_DAY_FRACTION,
  MIN_INVESTED_RATIO,
  MIN_TRADE_COUNT,
  STARTING_BALANCE,
} from "@/lib/competition/rules";
import { useCompetition } from "./CompetitionProvider";

// Mirrors the server's HANDLE_PATTERN (app/api/competition/profile/route.ts)
// for instant feedback — the server remains the source of truth for
// reserved words, profanity, and uniqueness, none of which are duplicated
// here.
const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function CompetitionOptIn() {
  const { optIn } = useCompetition();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!HANDLE_PATTERN.test(handle)) {
      setError("Handle must be 3-20 characters: letters, digits, and underscores only.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await optIn(handle);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="phase-stub" style={{ maxWidth: 640 }}>
      <div className="label">Monthly Leaderboard</div>
      <h2>Opt in and pick a handle.</h2>
      <p>
        Every entrant trades a separate ${STARTING_BALANCE.toLocaleString("en-US")} paper account
        for the calendar month. Standings are computed once a day after the close and shown
        publicly under your handle only — never your name or email.
      </p>
      <p>
        To appear on the public board, you&rsquo;ll need at least {MIN_TRADE_COUNT} trades across{" "}
        {MIN_DISTINCT_TICKERS} different tickers, and to stay at least {Math.round(MIN_INVESTED_RATIO * 100)}%
        invested on at least {Math.round(MIN_INVESTED_DAY_FRACTION * 100)}% of the days you
        participate.
      </p>
      <div className="onboard-custom" style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="Choose a handle"
          maxLength={20}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Opting in…" : "Opt In"}
        </button>
      </div>
      {error && (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
