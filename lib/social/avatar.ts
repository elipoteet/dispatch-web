export function initials(name: string): string {
  // The one Dispatch AI account (docs/phase-seven.md) — the general
  // two-word algorithm below would produce "DA" from "Dispatch AI", not
  // the "AI" the design calls for. Narrow, explicit exception rather than
  // changing the algorithm or threading an override prop through every
  // Avatar call site — there is and will only ever be one such account.
  if (name === "Dispatch AI") return "AI";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // A single-token display name (e.g. an unchanged onboarding default like
  // "elipoteet") has no second word to take an initial from — fall back to
  // the first two characters of that one word rather than rendering just
  // one letter.
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
