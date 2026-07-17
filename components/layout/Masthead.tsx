"use client";

import { useEffect, useState } from "react";

export function Masthead() {
  const [date, setDate] = useState("— — —");

  useEffect(() => {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    setDate(new Date().toLocaleDateString("en-US", opts));
  }, []);

  return (
    <div className="masthead">
      <span>
        The Dispatch <span className="dot">•</span> Est. 2026
      </span>
      <span>{date}</span>
    </div>
  );
}
