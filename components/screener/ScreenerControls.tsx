"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MAIN_GROUPS,
  MORE_GROUPS,
  NEW_ENGLAND,
  PAGE_SIZE,
  RANGE_FILTERS,
  SECTOR_OPTIONS,
  STATE_OPTIONS,
  makeRange,
  parseValue,
  sectorSlug,
  stateName,
  stateSlug,
  viewQuery,
  type Filters,
  type Group,
  type Order,
  type RangeFilter,
  type Unit,
} from "@/lib/screener/filters";
import type { Sector } from "@/lib/screener/sectors";

export type Chip = { key: string; text: string; href: string };
export type SortChoice = { label: string; href: string };

type Props = {
  chips: Chip[];
  // A quiet line under the chips (the default revenue filter's note).
  note: string | null;
  // What each box starts with, by filter param.
  boxes: Record<string, { min: string; max: string }>;
  sectors: string[];
  states: string[];
  dividend: boolean;
  // "Half of companies: above 38%", by filter param, and for "dividend".
  medians: Record<string, string>;
  // Carried into the new link when the filters change.
  sort: string;
  order: Order;
  open: boolean;
  sortChoices: SortChoice[];
  sortHref: string;
  clearHref: string;
};

const UNIT_MARK: Record<Unit, string> = { money: "$", percent: "%", points: "pts", ratio: "×", count: "yrs" };

// The toolbar above the results (active filters as removable chips, Edit
// filters, Copy link, and on a phone a Sort menu), and the filter panel: the
// main filters, then "More filters". Applying the panel builds the new link
// with the same rules the page reads it with (lib/screener/filters.ts) and
// moves to it, so the screen is always in the address bar. Without this
// script the panel is a plain form and still works.
export function ScreenerControls(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(props.open);
  const moreActive = RANGE_FILTERS.some((f) => (MORE_GROUPS as readonly string[]).includes(f.group) && (props.boxes[f.param]?.min || props.boxes[f.param]?.max));
  const [more, setMore] = useState(moreActive || props.states.length > 0 || props.dividend);
  const [boxes, setBoxes] = useState(props.boxes);
  const [sectors, setSectors] = useState<string[]>(props.sectors);
  const [states, setStates] = useState<string[]>(props.states);
  const [dividend, setDividend] = useState(props.dividend);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  function setBox(param: string, end: "min" | "max", text: string) {
    setBoxes((b) => ({ ...b, [param]: { ...(b[param] ?? { min: "", max: "" }), [end]: text } }));
  }

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const filters: Filters = {
      ranges: {},
      sectors: SECTOR_OPTIONS.filter((s) => sectors.includes(s)) as Sector[],
      states: STATE_OPTIONS.filter((s) => states.includes(s)),
      dividend,
    };
    for (const f of RANGE_FILTERS) {
      const box = boxes[f.param];
      const range = box && makeRange(parseValue(f.unit, box.min), parseValue(f.unit, box.max));
      if (range) filters.ranges[f.param] = range;
    }
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

  const toggleState = (s: string) => setStates(states.includes(s) ? states.filter((x) => x !== s) : [...states, s]);
  const ne = [...NEW_ENGLAND] as string[];
  const allNe = ne.every((s) => states.includes(s));

  const group = (g: Group) => (
    <fieldset key={g} className="rf-scr-group">
      <legend className="rf-lbl">{g}</legend>
      {RANGE_FILTERS.filter((f) => f.group === g).map((f) => (
        <RangeRow key={f.param} f={f} box={boxes[f.param] ?? { min: "", max: "" }} median={props.medians[f.param]} onChange={setBox} />
      ))}
      {g === "Shareholder returns" && (
        <div className="rf-scr-range">
          <span className="rf-scr-range-label" id="f-dividend">
            Pays a dividend
            <span className="rf-scr-def">Paid any dividend to shareholders in the latest fiscal year.</span>
            {props.medians.dividend && <span className="rf-scr-median">{props.medians.dividend}</span>}
          </span>
          <span className="rf-seg" role="radiogroup" aria-labelledby="f-dividend">
            {[
              { label: "Either", on: !dividend },
              { label: "Yes", on: dividend },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={o.on}
                className={`rf-seg-btn${o.on ? " is-active" : ""}`}
                onClick={() => setDividend(o.label === "Yes")}
              >
                {o.label}
              </button>
            ))}
          </span>
          {/* What a plain form sends if this script hasn't run. */}
          {dividend && <input type="hidden" name="dividend" value="yes" />}
        </div>
      )}
    </fieldset>
  );

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
        <form id="screener-filters" className="rf-scr-panel" method="get" action="/screener" onSubmit={apply}>
          <p className="rf-scr-howto">
            Type a minimum, a maximum or both. Percent boxes take 20 or 20%; dollar boxes take 500M, 1.5B or $2B. Leave a box empty to
            skip it.
          </p>
          {MAIN_GROUPS.map(group)}
          <fieldset className="rf-scr-group rf-scr-wide">
            <legend className="rf-lbl">Sector</legend>
            <div className="rf-scr-checks">
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
            <p className="rf-scr-hint">None ticked means every sector.</p>
          </fieldset>

          <div className="rf-scr-wide rf-scr-more-head">
            <button type="button" className="rf-btn" aria-expanded={more} aria-controls="screener-more" onClick={() => setMore(!more)}>
              {more ? "Fewer filters" : "More filters"}
            </button>
            {!more && <span className="rf-scr-hint">Returns on equity and assets, spending, dividends, balance sheet health, longer history, and headquarters.</span>}
          </div>
          {more && (
            <div id="screener-more" className="rf-scr-more-body">
              {MORE_GROUPS.map(group)}
              <fieldset className="rf-scr-group rf-scr-wide">
                <legend className="rf-lbl">Headquarters</legend>
                <div className="rf-scr-statebar">
                  <button type="button" className="rf-linkbtn" onClick={() => setStates(allNe ? states.filter((s) => !ne.includes(s)) : [...new Set([...states, ...ne])])}>
                    {allNe ? "Clear New England" : "All of New England"}
                  </button>
                  {states.length > 0 && (
                    <button type="button" className="rf-linkbtn" onClick={() => setStates([])}>
                      Clear ({states.length})
                    </button>
                  )}
                </div>
                <div className="rf-scr-states">
                  {STATE_OPTIONS.map((s) => (
                    <label key={s} className="rf-scr-state">
                      <input type="checkbox" name="state" value={stateSlug(s)} checked={states.includes(s)} onChange={() => toggleState(s)} />
                      <span>{stateName(s)}</span>
                    </label>
                  ))}
                </div>
                <p className="rf-scr-hint">From the business address the company gives the SEC. None ticked means anywhere.</p>
              </fieldset>
            </div>
          )}

          <div className="rf-scr-panel-foot">
            <button type="submit" className="rf-btn rf-btn-solid">
              Show results
            </button>
            <Link href={props.clearHref} className="rf-linkbtn" prefetch={false}>
              Clear all
            </Link>
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

function RangeRow({
  f,
  box,
  median,
  onChange,
}: {
  f: RangeFilter;
  box: { min: string; max: string };
  median?: string;
  onChange: (param: string, end: "min" | "max", text: string) => void;
}) {
  const bad = (text: string) => text.trim() !== "" && parseValue(f.unit, text) == null;
  const invalid = bad(box.min) || bad(box.max);
  const mark = UNIT_MARK[f.unit];
  const placeholder = f.unit === "money" ? { min: "e.g. 100M", max: "e.g. 1B" } : { min: "Min", max: "Max" };
  return (
    <div className="rf-scr-range">
      <span className="rf-scr-range-label" id={`f-${f.param}`}>
        {f.label}
        <span className="rf-scr-def">{f.definition}</span>
        {median && <span className="rf-scr-median">{median}</span>}
      </span>
      <span className="rf-scr-range-boxes">
        {(["min", "max"] as const).map((end, i) => (
          <span key={end} className="rf-scr-box-wrap">
            {i === 1 && <span className="rf-scr-to">to</span>}
            <span className={`rf-scr-box${bad(box[end]) ? " is-bad" : ""}`}>
              {f.unit === "money" && <span className="rf-scr-unit">{mark}</span>}
              <input
                type="text"
                inputMode={f.unit === "money" ? "text" : "decimal"}
                name={`${f.param}_${end}`}
                value={box[end]}
                placeholder={placeholder[end]}
                aria-label={`${f.label}, ${end === "min" ? "at least" : "at most"}`}
                aria-describedby={`f-${f.param}`}
                aria-invalid={bad(box[end]) || undefined}
                autoComplete="off"
                onChange={(e) => onChange(f.param, end, e.target.value)}
              />
              {f.unit !== "money" && <span className="rf-scr-unit">{mark}</span>}
            </span>
          </span>
        ))}
      </span>
      {invalid && <span className="rf-scr-hint rf-scr-range-note">Not a number, so it&rsquo;s left out.</span>}
    </div>
  );
}
