"use client";

import { useId, useState } from "react";
import {
  DEFAULT_HORIZON,
  HORIZONS,
  REQUIRED_RETURN,
  TERMINAL_GROWTH,
  impliedGrowth,
} from "@/lib/research/reverseDcf";
import { formatMoney } from "@/lib/research/format";

// "What's priced in" (phase nine, stage 4). The growth today's market value
// implies, recalculated in the browser as the inputs move. It never gives a
// value per share, an upside or a downside: only the growth the price already
// assumes.
export function PricedIn({
  marketValue,
  baseFcf,
  baseLabel,
}: {
  marketValue: number;
  baseFcf: number;
  // "the four quarters to July 2026"
  baseLabel: string;
}) {
  const [requiredReturn, setRequiredReturn] = useState(REQUIRED_RETURN.default);
  const [terminalGrowth, setTerminalGrowth] = useState(TERMINAL_GROWTH.default);
  const [years, setYears] = useState<number>(DEFAULT_HORIZON);
  const ids = { r: useId(), g: useId() };

  const result = impliedGrowth({ marketValue, baseFcf, requiredReturn, terminalGrowth, years });
  const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

  let sentence: React.ReactNode;
  if (result.kind === "ok") {
    sentence = (
      <>
        To justify today&rsquo;s price, free cash flow has to grow about <strong>{pct(result.growth)}</strong> a year for{" "}
        {years} years.
      </>
    );
  } else if (result.kind === "out-of-range") {
    sentence =
      result.direction === "above"
        ? `To justify today’s price, free cash flow would have to grow more than 100% a year for ${years} years, past the range this calculator searches.`
        : `Today’s price would be matched even if free cash flow shrank more than 50% a year for ${years} years.`;
  } else {
    sentence = "The required return has to be above the long-run growth rate for this calculation to work.";
  }

  return (
    <section className="rf-panel rf-pi" aria-labelledby={`${ids.r}-title`}>
      <div className="rf-lbl" id={`${ids.r}-title`}>
        What&rsquo;s priced in
      </div>
      <p className="rf-pi-sentence" aria-live="polite">
        {sentence}
      </p>
      {result.kind === "ok" && (
        <p className="rf-pi-sub">
          That takes it from {formatMoney(baseFcf)} over {baseLabel} to about {formatMoney(result.endFcf)} in year {years},
          growing {pct(terminalGrowth)} a year after that, against a market value of {formatMoney(marketValue)}.
        </p>
      )}

      <div className="rf-pi-inputs">
        <label className="rf-pi-input" htmlFor={ids.r}>
          <span className="rf-lbl">Required return</span>
          <span className="rf-pi-value">{pct(requiredReturn)}</span>
          <input
            id={ids.r}
            type="range"
            min={REQUIRED_RETURN.min}
            max={REQUIRED_RETURN.max}
            step={REQUIRED_RETURN.step}
            value={requiredReturn}
            onChange={(e) => setRequiredReturn(Number(e.target.value))}
          />
        </label>
        <label className="rf-pi-input" htmlFor={ids.g}>
          <span className="rf-lbl">Growth after that, for good</span>
          <span className="rf-pi-value">{pct(terminalGrowth)}</span>
          <input
            id={ids.g}
            type="range"
            min={TERMINAL_GROWTH.min}
            max={TERMINAL_GROWTH.max}
            step={TERMINAL_GROWTH.step}
            value={terminalGrowth}
            onChange={(e) => setTerminalGrowth(Number(e.target.value))}
          />
        </label>
        <div className="rf-pi-input" role="group" aria-label="Years of growth">
          <span className="rf-lbl">Years of growth</span>
          <div className="rf-toggle">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                className={`rf-toggle-btn${h === years ? " is-active" : ""}`}
                aria-pressed={h === years}
                onClick={() => setYears(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="rf-pi-how">
        How it works: today&rsquo;s market value is treated as the present value of all the free cash flow the company will
        ever produce, discounted at the required return. The calculator finds the yearly growth over the chosen years,
        followed by steady growth for good, that makes the two equal. It is arithmetic on today&rsquo;s price, not a
        forecast, and it doesn&rsquo;t say what the stock is worth.
      </p>
    </section>
  );
}
