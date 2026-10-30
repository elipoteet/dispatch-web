// The one definition of what a ticker symbol may look like.
//
// It lives in its own dependency-free module rather than inside
// lib/analysis/loadReport.ts, where it used to sit, for two reasons:
// importing a regex should not drag the whole memo engine (providers,
// indicators, report builder) into a route that only wanted to validate a
// string, and that engine is being retired by phase nine while the pattern
// outlives it.
//
// Uppercase-only is deliberate — input is uppercased before it is tested,
// so a lowercase symbol is a normalization bug rather than a valid variant.
// No `g` flag, so `.test()` carries no state between calls and this constant
// is safe to share.
//
// Never re-declare this pattern inline. Three API routes each had their own
// copy of it before September 2026.
export const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;
