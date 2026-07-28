"use client";

import { useEffect, useRef, useState } from "react";

type AlertEvent = {
  id: string;
  ticker: string;
  type: "score_change" | "rsi" | "ma_cross";
  old_value: string | null;
  new_value: string;
  created_at: string;
};

// Renders in the site's editorial voice — a plain sentence, not a generic
// "ALERT!!" transactional-notification look.
function describeEvent(e: AlertEvent): string {
  switch (e.type) {
    case "score_change":
      return `${e.ticker} moved ${e.old_value ?? "—"} → ${e.new_value}`;
    case "rsi":
      return `${e.ticker}'s RSI just went ${e.new_value}`;
    case "ma_cross":
      return `${e.ticker} formed a ${e.new_value} cross`;
    default:
      return `${e.ticker} changed`;
  }
}

export function AlertBell() {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/alerts")
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((json) => setEvents(json.events ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="alert-bell" ref={rootRef}>
      <button
        type="button"
        className="alert-bell-btn"
        aria-label="Alerts"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {events.length > 0 && <span className="alert-bell-badge">{events.length}</span>}
      </button>
      {open && (
        <div className="alert-bell-dropdown">
          <div className="alert-bell-title">Alerts</div>
          {!loaded ? (
            <div className="alert-bell-empty">Loading…</div>
          ) : events.length === 0 ? (
            <div className="alert-bell-empty">No new alerts</div>
          ) : (
            events.map((e) => (
              <div className="alert-bell-item" key={e.id}>
                <div className="alert-bell-item-text">{describeEvent(e)}</div>
                <div className="alert-bell-item-date">
                  {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
