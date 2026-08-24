"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Matches the prototype's header search bar in position and intent, not
// its exact mechanism: the prototype filters a small hardcoded in-memory
// ticker list as you type and shows a live dropdown. Nothing in this app
// can back a real version of that today — there's no company-name/symbol
// search endpoint anywhere (grep-confirmed; ResearchDesk's own ticker
// input is the same plain "type an exact symbol" box this reuses), and
// building one would mean a new API route hitting a new provider endpoint
// plus its own rate-limit budgeting, which is new backend capability, not
// a visual/behavioral parity fix — out of scope for "no new features."
// Submitting a symbol here goes straight to /research/[ticker], the same
// destination a search would eventually land on anyway.
export function TickerSearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const symbol = value.trim().toUpperCase();
    if (!symbol) return;
    router.push(`/research/${encodeURIComponent(symbol)}`);
    setValue("");
  }

  return (
    <form className="header-search" onSubmit={handleSubmit} role="search">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        placeholder="Search tickers"
        aria-label="Search tickers"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
      />
    </form>
  );
}
