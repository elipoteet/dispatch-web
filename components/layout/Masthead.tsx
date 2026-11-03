"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketsStrip } from "@/lib/research/markets";

// The dark bar above the nav. On the right, the markets strip, worked out on
// the server with the page (lib/research/markets.ts) so it's there from the
// first paint; when there's no strip, the date as before.
export function Masthead({ markets }: { markets: MarketsStrip | null }) {
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
      <span className={`mast-brand${markets ? " has-markets" : ""}`}>
        The Dispatch
        <span className="mast-est">
          {" "}
          <span className="dot">•</span> Est. 2026
        </span>
      </span>
      {markets ? (
        // A still line: on a narrow screen it scrolls sideways in its own box.
        <div className="mast-markets">
          <ul aria-label="Markets">
            {markets.items.map((item) => {
              const body = (
                <>
                  <span className="mk-sym">{item.symbol}</span>
                  <span className="mk-px">{item.value}</span>
                  {item.change && (
                    <span className={`mk-chg ${item.direction}`}>
                      {item.direction !== "flat" && <span aria-hidden="true">{item.direction === "up" ? "▲ " : "▼ "}</span>}
                      {item.change}
                    </span>
                  )}
                </>
              );
              return (
                <li key={item.symbol} title={item.title}>
                  {/* No prefetch: a prefetched company page spends Twelve Data requests. */}
                  {item.href ? (
                    <Link href={item.href} prefetch={false}>
                      {body}
                    </Link>
                  ) : (
                    <span className="mk-item">{body}</span>
                  )}
                </li>
              );
            })}
            {markets.atClose && <li className="mk-note">At close</li>}
          </ul>
        </div>
      ) : (
        <span>
          <span className="date-long">{date.long}</span>
          <span className="date-short">{date.short}</span>
        </span>
      )}
    </div>
  );
}
