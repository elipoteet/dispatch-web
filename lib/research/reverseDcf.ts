// "What's priced in": the growth in free cash flow that today's market value
// assumes, worked backward from the price (phase nine, Stage 4).
//
// Dependency-free and pure: the Valuation tab runs it in the browser so the
// answer moves as the visitor changes the inputs, and the tests run it against
// a case worked by hand.
//
// The model: free cash flow starts at today's trailing twelve months and grows
// at g for N years; after that it grows at the terminal rate forever. Each
// year's cash flow, and the value of everything after year N, is discounted at
// the required return. The g that makes the total equal today's market value is
// the growth the price assumes.
//
// It never produces a value per share, a price, an upside or a downside: only
// the growth rate a price implies, which is a description of the price, not a
// judgement of it.

export type PricedInInputs = {
  marketValue: number;
  baseFcf: number;
  requiredReturn: number; // 0.10 for 10%
  terminalGrowth: number; // 0.03 for 3%
  years: number;
};

// What the cash flows are worth today if they grow at g.
export function presentValue(inputs: Omit<PricedInInputs, "marketValue">, g: number): number {
  const { baseFcf, requiredReturn: r, terminalGrowth: tg, years } = inputs;
  let pv = 0;
  let fcf = baseFcf;
  for (let t = 1; t <= years; t++) {
    fcf *= 1 + g;
    pv += fcf / (1 + r) ** t;
  }
  const terminal = (fcf * (1 + tg)) / (r - tg);
  return pv + terminal / (1 + r) ** years;
}

export type PricedIn =
  | { kind: "ok"; growth: number; endFcf: number }
  // The price would need growth beyond what the solver searches (over 100% a
  // year, or a decline steeper than 50% a year): say so rather than invent one.
  | { kind: "out-of-range"; direction: "above" | "below" }
  // The model can't run: no positive free cash flow to grow, or a required
  // return no higher than the terminal growth (which makes the terminal value
  // infinite).
  | { kind: "not-applicable"; reason: "no-fcf" | "inputs" };

const LOW = -0.5;
const HIGH = 1.0;

// Bisection: presentValue rises with g, so halve the bracket until it's
// narrower than a hundredth of a percentage point.
export function impliedGrowth(inputs: PricedInInputs): PricedIn {
  const { marketValue, baseFcf, requiredReturn, terminalGrowth, years } = inputs;
  if (!(baseFcf > 0) || !(marketValue > 0)) return { kind: "not-applicable", reason: "no-fcf" };
  if (!(requiredReturn > terminalGrowth) || years < 1) return { kind: "not-applicable", reason: "inputs" };

  let lo = LOW;
  let hi = HIGH;
  if (presentValue(inputs, hi) < marketValue) return { kind: "out-of-range", direction: "above" };
  if (presentValue(inputs, lo) > marketValue) return { kind: "out-of-range", direction: "below" };
  for (let i = 0; i < 100 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(inputs, mid) < marketValue) lo = mid;
    else hi = mid;
  }
  const growth = (lo + hi) / 2;
  return { kind: "ok", growth, endFcf: baseFcf * (1 + growth) ** years };
}

// The slider ranges from the brief.
export const REQUIRED_RETURN = { min: 0.07, max: 0.13, step: 0.005, default: 0.1 };
export const TERMINAL_GROWTH = { min: 0.01, max: 0.04, step: 0.005, default: 0.03 };
export const HORIZONS = [5, 10, 15] as const;
export const DEFAULT_HORIZON = 10;
