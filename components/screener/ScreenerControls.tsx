"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FILTER_GROUPS,
  PAGE_SIZE,
  RANGE_FILTERS,
  SECTOR_OPTIONS,
  makeRange,
  parseValue,
  sectorSlug,
  viewQuery,
  type Filters,
  type Order,
  type RangeFilter,
} from "@/lib/screener/filters";
import type { Sector } from "@/lib/screener/sectors";

export type Chip = { key: string; text: string; href: string };
export type SortChoice = { label: string; href: string };

type Props = {
  chips: Chip[];
  // What each box starts with, by filter param.
  boxes: Record<string, { min: string; max: string }>;
  sectors: string[];
  // Carried into the new link when the filters change.
  sort: string;
  order: Order;
  open: boolean;
  sortChoices: SortChoice[];
  sortHref: string;
  clearHref: string;
};

// The toolbar above the results (active filters as removable chips, Edit
// filters, Copy link, and on a phone a Sort menu), and the filter panel.
// Applying the panel builds the new link with the same rules the page reads
// it with (lib/screener/filters.ts) and moves to it, so the screen is always
// in the address bar. Without this script the panel is a plain form and
// still works.
export function ScreenerControls(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(props.open);
  const [boxes, setBoxes] = useState(props.boxes);
  const [sectors, setSectors] = useState<string[]>(props.sectors);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  function setBox(param: string, end: "min" | "max", text: string) {
    setBoxes((b) => ({ ...b, [param]: { ...(b[param] ?? { min: "", max: "" }), [end]: text } }));
  }

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const filters: Filters = { ranges: {}, sectors: SECTOR_OPTIONS.filter((s) => sectors.includes(s)) as Sector[] };
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
            <select
              className="rf-btn"
              value={props.sortHref}
              onChange={(e) => router.push(e.target.value, { scroll: false })}
            >
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
      </div>

      {open && (
        <form id="screener-filters" className="rf-scr-panel" method="get" action="/screener" onSubmit={apply}>
          {FILTER_GROUPS.map((group) => (
            <fieldset key={group} className="rf-scr-group">
              <legend className="rf-lbl">{group}</legend>
              {RANGE_FILTERS.filter((f) => f.group === group).map((f) => (
                <RangeRow key={f.param} f={f} box={boxes[f.param] ?? { min: "", max: "" }} onChange={setBox} />
              ))}
            </fieldset>
          ))}
          <fieldset className="rf-scr-group rf-scr-sectors">
            <legend className="rf-lbl">Sector</legend>
            <div className="rf-scr-checks">
              {SECTOR_OPTIONS.map((s) => {
                const on = sectors.includes(s);
                return (
                  <label key={s} className={`rf-scr-check${on ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      name="sector"
                      value={sectorSlug(s)}
                      checked={on}
                      onChange={() => setSectors(on ? sectors.filter((x) => x !== s) : [...sectors, s])}
                    />
                    <span>{s}</span>
                  </label>
                );
              })}
            </div>
            <p className="rf-scr-hint">None ticked means every sector.</p>
          </fieldset>
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

function RangeRow({ f, box, onChange }: { f: RangeFilter; box: { min: string; max: string }; onChange: (param: string, end: "min" | "max", text: string) => void }) {
  const bad = (text: string) => text.trim() !== "" && parseValue(f.unit, text) == null;
  const invalid = bad(box.min) || bad(box.max);
  const unit = f.unit === "percent" ? "%" : "$";
  const placeholder = f.unit === "percent" ? { min: "Min", max: "Max" } : { min: "e.g. 100M", max: "e.g. 1B" };
  return (
    <div className="rf-scr-range">
      <span className="rf-scr-range-label" id={`f-${f.param}`}>
        {f.label}
      </span>
      <span className="rf-scr-range-boxes">
        {(["min", "max"] as const).map((end, i) => (
          <span key={end} className="rf-scr-box-wrap">
            {i === 1 && <span className="rf-scr-to">to</span>}
            <span className={`rf-scr-box${bad(box[end]) ? " is-bad" : ""}`}>
              {f.unit === "money" && <span className="rf-scr-unit">{unit}</span>}
              <input
                type="text"
                inputMode={f.unit === "percent" ? "decimal" : "text"}
                name={`${f.param}_${end}`}
                value={box[end]}
                placeholder={placeholder[end]}
                aria-label={`${f.label}, ${end === "min" ? "at least" : "at most"}`}
                aria-invalid={bad(box[end]) || undefined}
                autoComplete="off"
                onChange={(e) => onChange(f.param, end, e.target.value)}
              />
              {f.unit === "percent" && <span className="rf-scr-unit">{unit}</span>}
            </span>
          </span>
        ))}
      </span>
      {invalid && <span className="rf-scr-hint rf-scr-range-note">Not a number, so it&rsquo;s left out.</span>}
    </div>
  );
}
