"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { symbol: string; name: string };

// Ticker or company name. Suggestions come from the SEC's list of listed
// companies via /api/search; pressing Enter on anything that looks like a
// ticker goes straight to its page, which is how funds and other symbols that
// aren't on the SEC's company list (QQQ, VOO) are reached.
export function CompanySearch({ autoFocus = false, placeholder = "Search a ticker or company name" }: { autoFocus?: boolean; placeholder?: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLFormElement>(null);

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

  function go(symbol: string) {
    setOpen(false);
    router.push(`/research/${encodeURIComponent(symbol.toLowerCase())}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (active >= 0 && results[active]) return go(results[active].symbol);
    const exact = results.find((r) => r.symbol.toUpperCase() === q.toUpperCase().replace(/^\$/, ""));
    if (exact) return go(exact.symbol);
    // Looks like a ticker: go to it, even if it isn't on the SEC's list.
    if (/^\$?[A-Za-z.\-]{1,10}$/.test(q) && !q.includes(" ")) return go(q.replace(/^\$/, ""));
    if (results[0]) return go(results[0].symbol);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length > 0 && results.length > 0;

  return (
    <form className="rf-search" role="search" onSubmit={onSubmit} ref={rootRef}>
      <label className="rf-search-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16" y2="16" />
        </svg>
        <span className="visually-hidden">Ticker or company name</span>
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
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
    </form>
  );
}
