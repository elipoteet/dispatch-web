"use client";

import { useEffect, useState } from "react";

export function Masthead() {
  // The long date, and a short one for a phone ("Nov 2, 2026"), where the
  // long one doesn't fit beside the name.
  const [date, setDate] = useState({ long: "— — —", short: "" });

  useEffect(() => {
    const now = new Date();
    setDate({
      long: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      short: now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    });
  }, []);

  return (
    <div className="masthead">
      <span>
        The Dispatch <span className="dot">•</span> Est. 2026
      </span>
      <span>
        <span className="date-long">{date.long}</span>
        <span className="date-short">{date.short}</span>
      </span>
    </div>
  );
}
