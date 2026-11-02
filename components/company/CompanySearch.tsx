"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearRecent, recentHref, RECENT_IN_SEARCH, viewedLabel } from "@/lib/recent";
import { useRecent } from "@/lib/useRecent";

type Result = { symbol: string; name: string };

// Ticker or company name. Suggestions come from the SEC's list of listed
// companies via /api/search; pressing Enter on anything that looks like a
// ticker goes straight to its page, which is how funds and other symbols that
// aren't on the SEC's company list (QQQ, VOO) are reached.
//
// Focused and empty, the box offers the visitor's recently viewed companies
// instead (phase ten, Stage B), with the same arrow keys, Enter and Escape.
export function CompanySearch({ autoFocus = false, placeholder = "Search a ticker or company name" }: { autoFocus?: boolean; placeholder?: string }) {
  const router = useRouter();
  const listId = useId();
  const recentTitleId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The focus autoFocus gives the box as the page loads isn't the visitor
  // asking for the list (on /research it would cover the same list shown
  // just below). Nor is the focus event the browser sends that same box again
  // when the window itself gains focus. So until the box has lost focus once,
  // focusing it doesn't open the list; a click or a key still does.
  const autoFocused = useRef(autoFocus);
  const recent = useRecent().slice(0, RECENT_IN_SEARCH);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = res.ok ? await res.json() : { results: [] };
        setResults(json.results ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        // An aborted or failed lookup leaves the last suggestions in place.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const typed = query.trim().length > 0;
  const showList = open && typed && results.length > 0;
  const showRecent = open && !typed && recent.length > 0;
  const options = showList ? results.length : showRecent ? recent.length : 0;

  function go(symbol: string) {
    setOpen(false);
    router.push(`/research/${encodeURIComponent(symbol.toLowerCase())}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      if (showRecent && active >= 0 && recent[active]) {
        setOpen(false);
        router.push(recentHref(recent[active]));
      }
      return;
    }
    if (active >= 0 && results[active]) return go(results[active].symbol);
    const exact = results.find((r) => r.symbol.toUpperCase() === q.toUpperCase().replace(/^\$/, ""));
    if (exact) return go(exact.symbol);
    // Looks like a ticker: go to it, even if it isn't on the SEC's list.
    if (/^\$?[A-Za-z.\-]{1,10}$/.test(q) && !q.includes(" ")) return go(q.replace(/^\$/, ""));
    if (results[0]) return go(results[0].symbol);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (options === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    }
  }

  return (
    <form
      className="rf-search"
      role="search"
      onSubmit={onSubmit}
      ref={rootRef}
      onBlur={(e) => {
        // Tabbing out of the search closes its list; moving within it doesn't.
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="rf-search-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16" y2="16" />
        </svg>
        <span className="visually-hidden">Ticker or company name</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList || showRecent}
          aria-controls={listId}
          aria-activedescendant={active >= 0 && options > 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            if (!autoFocused.current) setOpen(true);
          }}
          onBlur={() => {
            autoFocused.current = false;
          }}
          // Already focused (by autoFocus), a click still opens the list.
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </label>
      <button type="submit" className="rf-btn rf-btn-solid rf-search-go">
        Open file
      </button>
      {showList && (
        <ul className="rf-search-list" id={listId} role="listbox">
          {results.map((r, i) => (
            <li key={r.symbol} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={`rf-search-item${i === active ? " is-active" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.symbol)}>
                <span className="rf-search-sym">{r.symbol}</span>
                <span className="rf-search-name">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showRecent && (
        // Mouse presses inside keep the focus in the box, so the list stays
        // open until a choice is made.
        <div className="rf-search-list rf-search-drop" onMouseDown={(e) => e.preventDefault()}>
          <div className="rf-search-drop-head">
            <span className="rf-lbl" id={recentTitleId}>
              Recently viewed
            </span>
            <button
              type="button"
              className="rf-linkbtn"
              onClick={() => {
                clearRecent();
                setActive(-1);
                inputRef.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
          <ul className="rf-search-options" id={listId} role="listbox" aria-labelledby={recentTitleId}>
            {recent.map((r, i) => (
              <li key={r.symbol} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                {/* No prefetch, as on the home page's cards: a prefetched
                    company page spends Twelve Data requests. */}
                <Link
                  href={recentHref(r)}
                  prefetch={false}
                  className={`rf-search-item${i === active ? " is-active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="rf-search-sym">{r.symbol}</span>
                  <span className="rf-search-name">{r.name}</span>
                  <span className="rf-search-when">{viewedLabel(r.viewedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="rf-search-drop-foot">Type to search every U.S. company by ticker or name.</p>
        </div>
      )}
    </form>
  );
}
