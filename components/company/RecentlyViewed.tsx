"use client";

import { useId } from "react";
import Link from "next/link";
import { clearRecent, recentHref, removeRecent, RECENT_SHOW, tabLabel, viewedLabel } from "@/lib/recent";
import { useRecent } from "@/lib/useRecent";

// The companies this visitor opened lately, from their own browser (phase
// ten, Stage B). Renders nothing on the server or for a visitor with none, so
// the page around it stays cacheable and a first visit shows no empty box.
export function RecentlyViewed() {
  const titleId = useId();
  const list = useRecent().slice(0, RECENT_SHOW);
  if (list.length === 0) return null;

  // Removing a card shouldn't drop keyboard focus onto the page: it moves to
  // the next card's button, or the previous one's at the end of the list.
  function remove(symbol: string, index: number) {
    const next = list[index + 1] ?? list[index - 1];
    removeRecent(symbol);
    if (next) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-recent-x="${next.symbol}"]`)?.focus());
  }

  return (
    <section className="rf-home-section rf-recent" aria-labelledby={titleId}>
      <div className="rf-recent-head">
        <div>
          <div className="rf-lbl rf-kicker">Recently viewed</div>
          <h2 className="rf-h2" id={titleId}>
            Pick up where you left off
          </h2>
        </div>
        <div className="rf-recent-tools">
          <span className="rf-lbl">Saved on this device only</span>
          <button type="button" className="rf-linkbtn" onClick={() => clearRecent()}>
            Clear all
          </button>
        </div>
      </div>
      <ul className="rf-recent-grid">
        {list.map((e, i) => (
          <li key={e.symbol} className="rf-recent-card">
            <span className="rf-recent-sym">{e.symbol}</span>
            {/* No prefetch: a prefetched company page loads its data, which
                would spend Twelve Data requests on companies nobody clicked. */}
            <Link href={recentHref(e)} className="rf-recent-link" prefetch={false}>
              {e.name}
            </Link>
            <span className="rf-recent-meta">
              {viewedLabel(e.viewedAt)} · {tabLabel(e.tab)}
            </span>
            <button
              type="button"
              className="rf-recent-x"
              aria-label={`Remove ${e.name} from recently viewed`}
              data-recent-x={e.symbol}
              onClick={() => remove(e.symbol, i)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
