// The one definition of what a ticker symbol may look like.
//
// It lives in its own dependency-free module rather than inside
// lib/analysis/loadReport.ts, where it used to sit, for two reasons:
// importing a regex should not drag the whole research engine (providers,
// indicators, report builder) into a route that only wanted to validate a
// string, and the social product should not have to reach into the retired
// product's engine to check a cashtag.
//
// Uppercase-only is deliberate — input is uppercased before it is tested,
// so a lowercase symbol is a normalization bug rather than a valid variant.
// No `g` flag, so `.test()` carries no state between calls and this constant
// is safe to share.
//
// Never re-declare this pattern inline. Three API routes each had their own
// copy of it before September 2026; see CLAUDE.md, "Import boundaries".
export const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;
