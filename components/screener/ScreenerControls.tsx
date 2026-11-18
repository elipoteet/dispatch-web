"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  NEW_ENGLAND,
  PAGE_SIZE,
  PICKER_ENTRIES,
  PICKER_GROUPS,
  SECTOR_OPTIONS,
  STATE_OPTIONS,
  filtersFromPanel,
  parseValue,
  pickerEntry,
  rangeFilter,
  searchFilters,
  sectorSlug,
  stateName,
  stateSlug,
  viewQuery,
  type Group,
  type Order,
  type PickerEntry,
  type RangeFilter,
  type Unit,
} from "@/lib/screener/filters";

export type Chip = { key: string; text: string; href: string };
export type SortChoice = { label: string; href: string };

type Box = { min: string; max: string };

type Props = {
  chips: Chip[];
  // A quiet line under the chips (the default revenue filter's note).
  note: string | null;
  // The filters in use, in the order their rows start in: range params, then
  // "dividend", "sector", "state" (lib/screener/filters.ts activeKeys).
  active: string[];
  // What each box starts with, by filter param.
  boxes: Record<string, Box>;
  sectors: string[];
  states: string[];
  dividend: boolean;
  // Beside the boxes: "Half above 38%", by filter param, and for "dividend".
  medians: Record<string, string>;
  // Behind the "?": "Half of companies: above 38%".
  medianLines: Record<string, string>;
  // Carried into the new link when the filters change.
  sort: string;
  order: Order;
  open: boolean;
  sortChoices: SortChoice[];
  sortHref: string;
  clearHref: string;
};

// After the max box, for every filter.
const UNIT_MARK: Record<Unit, string> = { money: "$", percent: "%", points: "pts", ratio: "×", count: "yrs", years: "yrs" };
const EMPTY: Box = { min: "", max: "" };

// The toolbar above the results (active filters as removable chips, Edit
// filters, Copy link, and on a phone a Sort menu), and the filter panel: one
// row per filter in use on a shared grid (name and ?, min, to, max, unit,
// median, remove), the full definition behind the ? one at a time, then
// "Add a filter", a picker of the rest by group. Applying the panel builds
// the new link with the same rules the page reads it with
// (lib/screener/filters.ts) and moves to it, so the screen is always in the
// address bar. Without this script the panel is a plain form of the rows it
// started with, and still works.
export function ScreenerControls(props: Props) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(props.open);
  const [active, setActive] = useState<string[]>(props.active);
  const [boxes, setBoxes] = useState<Record<string, Box>>(props.boxes);
  const [sectors, setSectors] = useState<string[]>(props.sectors);
  const [states, setStates] = useState<string[]>(props.states);
  const [dividend, setDividend] = useState(props.dividend);
  const [openDef, setOpenDef] = useState<string | null>(null);
  const [picking, setPicking] = useState(props.active.length === 0);
  const [pickGroup, setPickGroup] = useState<Group>(PICKER_GROUPS[0]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  function setBox(param: string, end: "min" | "max", text: string) {
    setBoxes((b) => ({ ...b, [param]: { ...(b[param] ?? EMPTY), [end]: text } }));
  }

  // Rows added, removed or edited since the page loaded, for the button.
  const changes = countChanges(props, { active, boxes, sectors, states, dividend });

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const filters = filtersFromPanel({ boxes: Object.fromEntries(active.map((k) => [k, boxes[k]])), sectors, states, dividend });
    const q = viewQuery({ filters, sort: props.sort, order: props.order, show: PAGE_SIZE, edit: false });
    router.push(q ? `/screener?${q}` : "/screener?edit=1");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    window.setTimeout(() => setCopied(null), 2500);
  }

  function add(key: string) {
    if (active.includes(key)) return;
    setActive([...active, key]);
    if (key === "dividend") setDividend(true);
    setOpenDef(null);
    // The new row's first box, once it's drawn.
    window.requestAnimationFrame(() => document.getElementById(`${uid}-${key}-min`)?.focus());
  }

  function remove(key: string) {
    setActive(active.filter((k) => k !== key));
    if (openDef === key) setOpenDef(null);
    if (key === "dividend") setDividend(false);
    else if (key === "sector") setSectors([]);
    else if (key === "state") setStates([]);
    else setBoxes((b) => ({ ...b, [key]: EMPTY }));
  }

  function closePicker() {
    setPicking(false);
    window.requestAnimationFrame(() => document.getElementById(`${uid}-add`)?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Escape") return;
    if (openDef) {
      e.preventDefault();
      setOpenDef(null);
      document.getElementById(`${uid}-${openDef}-q`)?.focus();
    } else if (picking && active.length > 0) {
      e.preventDefault();
      closePicker();
    }
  }

  const toggleState = (s: string) => setStates(states.includes(s) ? states.filter((x) => x !== s) : [...states, s]);
  const ne = [...NEW_ENGLAND] as string[];
  const allNe = ne.every((s) => states.includes(s));

  const rowHead = (entry: PickerEntry) => {
    const defOpen = openDef === entry.key;
    return (
      <span className="rf-scr-row-name">
        <span className="rf-scr-row-label" id={`${uid}-${entry.key}-label`}>
          {entry.label}
        </span>
        <button
          type="button"
          id={`${uid}-${entry.key}-q`}
          className={`rf-scr-qbtn${defOpen ? " is-open" : ""}`}
          aria-expanded={defOpen}
          aria-controls={`${uid}-${entry.key}-def`}
          aria-label={`What ${entry.label} means`}
          onClick={() => setOpenDef(defOpen ? null : entry.key)}
        >
          ?
        </button>
      </span>
    );
  };

  const rowDef = (entry: PickerEntry) =>
    openDef === entry.key && (
      <div id={`${uid}-${entry.key}-def`} className="rf-scr-row-def">
        <span>{entry.definition}</span>
        {props.medianLines[entry.key] && <span className="rf-scr-median">{props.medianLines[entry.key]}</span>}
      </div>
    );

  const removeBtn = (entry: PickerEntry) => (
    <button type="button" className="rf-scr-row-x" aria-label={`Remove ${entry.label}`} onClick={() => remove(entry.key)}>
      ×
    </button>
  );

  function row(key: string) {
    const entry = pickerEntry(key);
    if (!entry) return null;
    const f = rangeFilter(key);
    if (f) {
      return (
        <li key={key} className="rf-scr-row">
          <RangeRow f={f} uid={uid} box={boxes[key] ?? EMPTY} median={props.medians[key]} head={rowHead(entry)} remove={removeBtn(entry)} onChange={setBox} />
          {rowDef(entry)}
        </li>
      );
    }
    if (key === "dividend") {
      return (
        <li key={key} className="rf-scr-row">
          <div className="rf-scr-row-line">
            {rowHead(entry)}
            <span className="rf-scr-row-fixed">Yes</span>
            <span className="rf-scr-median">{props.medians.dividend ?? ""}</span>
            {removeBtn(entry)}
            {/* What a plain form sends if this script hasn't run. */}
            {dividend && <input type="hidden" name="dividend" value="yes" />}
          </div>
          {rowDef(entry)}
        </li>
      );
    }
    if (key === "sector") {
      return (
        <li key={key} className="rf-scr-row">
          <div className="rf-scr-row-line rf-scr-row-choice">
            {rowHead(entry)}
            <span />
            {removeBtn(entry)}
          </div>
          <div className="rf-scr-checks" role="group" aria-labelledby={`${uid}-sector-label`}>
            {SECTOR_OPTIONS.map((s) => {
              const on = sectors.includes(s);
              return (
                <label key={s} className={`rf-scr-check${on ? " is-on" : ""}`}>
                  <input type="checkbox" name="sector" value={sectorSlug(s)} checked={on} onChange={() => setSectors(on ? sectors.filter((x) => x !== s) : [...sectors, s])} />
                  <span>{s}</span>
                </label>
              );
            })}
          </div>
          {sectors.length === 0 && <span className="rf-scr-hint">None ticked means every sector.</span>}
          {rowDef(entry)}
        </li>
      );
    }
    return (
      <li key={key} className="rf-scr-row">
        <div className="rf-scr-row-line rf-scr-row-choice">
          {rowHead(entry)}
          <span className="rf-scr-statebar">
            <button type="button" className="rf-linkbtn" onClick={() => setStates(allNe ? states.filter((s) => !ne.includes(s)) : [...new Set([...states, ...ne])])}>
              {allNe ? "Clear New England" : "All of New England"}
            </button>
            {states.length > 0 && (
              <button type="button" className="rf-linkbtn" onClick={() => setStates([])}>
                Clear ({states.length})
              </button>
            )}
          </span>
          {removeBtn(entry)}
        </div>
        <div className="rf-scr-states" role="group" aria-labelledby={`${uid}-state-label`}>
          {STATE_OPTIONS.map((s) => (
            <label key={s} className="rf-scr-state">
              <input type="checkbox" name="state" value={stateSlug(s)} checked={states.includes(s)} onChange={() => toggleState(s)} />
              <span>{stateName(s)}</span>
            </label>
          ))}
        </div>
        {states.length === 0 && <span className="rf-scr-hint">None ticked means anywhere.</span>}
        {rowDef(entry)}
      </li>
    );
  }

  // The picker: what the search finds, or the chosen group.
  const searching = search.trim() !== "";
  const offered = searching ? searchFilters(search) : PICKER_ENTRIES.filter((e) => e.group === pickGroup);
  const groupCount = (g: Group) => PICKER_ENTRIES.filter((e) => e.group === g).length;

  return (
    <div className="rf-scr-controls">
      <div className="rf-scr-toolbar">
        <div className="rf-scr-buttons">
          <button type="button" className="rf-btn" aria-expanded={open} aria-controls="screener-filters" onClick={() => setOpen(!open)}>
            <span className="rf-long">{open ? "Hide filters" : "Edit filters"}</span>
            <span className="rf-short">Filters{props.chips.length ? ` (${props.chips.length})` : ""}</span>
          </button>
          <label className="rf-scr-sortmenu">
            <span className="visually-hidden">Sort the results</span>
            <select className="rf-btn" value={props.sortHref} onChange={(e) => router.push(e.target.value, { scroll: false })}>
              {props.sortChoices.map((c) => (
                <option key={c.href} value={c.href}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {props.chips.length > 0 && (
          <ul className="rf-scr-chips" aria-label="Active filters">
            {props.chips.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className="rf-chip rf-scr-chip" aria-label={`Remove filter: ${c.text}`} prefetch={false}>
                  <span>{c.text}</span>
                  <span aria-hidden="true" className="rf-scr-chip-x">
                    ×
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="rf-linkbtn rf-scr-copy" onClick={copy} aria-live="polite">
          {copied === "yes" ? "Link copied" : copied === "no" ? "Couldn’t copy: use the address bar" : "Copy link to this screen"}
        </button>
        {props.note && <p className="rf-scr-toolnote">{props.note}</p>}
      </div>

      {open && (
        <form id="screener-filters" className="rf-scr-panel" method="get" action="/screener" onSubmit={apply} onKeyDown={onKeyDown}>
          <div className="rf-scr-panel-head">
            <span className="rf-lbl">Your filters · {active.length}</span>
            <Link href={props.clearHref} className="rf-linkbtn" prefetch={false}>
              Clear all
            </Link>
          </div>
          {active.length === 0 ? (
            <p className="rf-scr-hint rf-scr-none">No filters yet. Add one below.</p>
          ) : (
            <ul className="rf-scr-rows" aria-label="Your filters">
              {active.map(row)}
            </ul>
          )}

          {!picking && (
            <div className="rf-scr-add">
              <button type="button" id={`${uid}-add`} className="rf-linkbtn rf-scr-addbtn" aria-expanded={false} aria-controls={`${uid}-picker`} onClick={() => setPicking(true)}>
                + Add a filter
              </button>
              <span className="rf-scr-hint">Growth, margins, returns, spending, balance sheet, dividends, sector and headquarters.</span>
            </div>
          )}
          {picking && (
            <div id={`${uid}-picker`} className="rf-scr-picker">
              <div className="rf-scr-picker-head">
                <label className="rf-scr-search">
                  <span className="rf-scr-search-label">Search filters</span>
                  <input type="search" value={search} placeholder="Try “debt” or “growth”" autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
                </label>
                {active.length > 0 && (
                  <button type="button" className="rf-linkbtn rf-scr-done" onClick={closePicker}>
                    Done adding
                  </button>
                )}
              </div>
              {!searching && (
                <div className="rf-scr-picker-groups" role="group" aria-label="Filter groups">
                  {PICKER_GROUPS.map((g) => (
                    <button key={g} type="button" className={`rf-scr-pgroup${g === pickGroup ? " is-on" : ""}`} aria-pressed={g === pickGroup} onClick={() => setPickGroup(g)}>
                      {g} <span className="rf-scr-pgroup-n">· {groupCount(g)}</span>
                    </button>
                  ))}
                </div>
              )}
              {offered.length === 0 ? (
                <p className="rf-scr-hint">No filter matches “{search.trim()}”.</p>
              ) : (
                <ul className="rf-scr-picks" aria-label={searching ? `Filters matching ${search.trim()}` : pickGroup}>
                  {offered.map((e) => {
                    const on = active.includes(e.key);
                    return (
                      <li key={e.key}>
                        <button type="button" className={`rf-scr-pick${on ? " is-on" : ""}`} aria-disabled={on || undefined} onClick={() => add(e.key)}>
                          <span className="rf-scr-pick-name">
                            <span aria-hidden="true" className="rf-scr-pick-mark">
                              {on ? "✓" : "+"}
                            </span>
                            {e.label}
                            {on && <span className="visually-hidden"> (already in your filters)</span>}
                          </span>
                          <span className="rf-scr-pick-short">
                            {e.short}
                            {searching && <span className="rf-scr-pick-group"> · {e.group}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="rf-scr-panel-foot">
            <button type="submit" className={`rf-btn${changes > 0 ? " rf-btn-solid" : ""}`}>
              {changes > 0 ? `Show results · ${changes} ${changes === 1 ? "change" : "changes"}` : "Show results"}
            </button>
          </div>
          <p className="rf-scr-noprice">
            No price filters: P/E, dividend yield, market value and price moves need share prices, and the screener reads filings only.
            Each company&rsquo;s file has them on its Valuation tab.
          </p>
        </form>
      )}
    </div>
  );
}

// How many rows differ from the page's link: added, removed, or with a box or
// a choice edited.
function countChanges(start: Props, now: { active: string[]; boxes: Record<string, Box>; sectors: string[]; states: string[]; dividend: boolean }): number {
  let n = 0;
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const key of new Set([...start.active, ...now.active])) {
    const was = start.active.includes(key);
    const is = now.active.includes(key);
    if (was !== is) n++;
    else if (key === "sector") n += same(start.sectors, now.sectors) ? 0 : 1;
    else if (key === "state") n += same(start.states, now.states) ? 0 : 1;
    else if (key === "dividend") n += start.dividend === now.dividend ? 0 : 1;
    else {
      const a = start.boxes[key] ?? EMPTY;
      const b = now.boxes[key] ?? EMPTY;
      if (a.min.trim() !== b.min.trim() || a.max.trim() !== b.max.trim()) n++;
    }
  }
  return n;
}

// One range's row on the shared grid: name and ?, min, "to", max, the unit,
// the median, remove. The grid lives in research-file.css (.rf-scr-row-line).
function RangeRow({
  f,
  uid,
  box,
  median,
  head,
  remove,
  onChange,
}: {
  f: RangeFilter;
  uid: string;
  box: Box;
  median?: string;
  head: React.ReactNode;
  remove: React.ReactNode;
  onChange: (param: string, end: "min" | "max", text: string) => void;
}) {
  const bad = (text: string) => text.trim() !== "" && parseValue(f.unit, text) == null;
  const invalid = bad(box.min) || bad(box.max);
  const empty = box.min.trim() === "" && box.max.trim() === "";
  const input = (end: "min" | "max") => (
    <span className={`rf-scr-box rf-scr-box-${end}${bad(box[end]) ? " is-bad" : ""}`}>
      <input
        type="text"
        id={`${uid}-${f.param}-${end}`}
        inputMode={f.unit === "money" ? "text" : "decimal"}
        name={`${f.param}_${end}`}
        value={box[end]}
        placeholder={end === "min" ? "Min" : "Max"}
        aria-label={`${f.label}, ${end === "min" ? "at least" : "at most"}`}
        aria-invalid={bad(box[end]) || undefined}
        autoComplete="off"
        onChange={(e) => onChange(f.param, end, e.target.value)}
      />
    </span>
  );
  return (
    <>
      <div className="rf-scr-row-line">
        {head}
        {input("min")}
        <span className="rf-scr-to">to</span>
        {input("max")}
        <span className="rf-scr-unit">{UNIT_MARK[f.unit]}</span>
        <span className="rf-scr-median">{median ?? ""}</span>
        {remove}
      </div>
      {invalid && <span className="rf-scr-hint">Not a number, so it&rsquo;s left out.</span>}
      {!invalid && empty && <span className="rf-scr-hint">Enter a min, a max, or both.</span>}
    </>
  );
}
