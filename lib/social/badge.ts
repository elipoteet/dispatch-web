// Student vs. alumni is derived here, at read time, from grad_year — no
// stored alumni value anywhere, even after supabase/migrations/0014_roles.sql
// added a role column (student | faculty | mentor, never "alumni" —
// see that migration's own comment on why).
export function isAlumni(gradYear: number, now: Date = new Date()): boolean {
  return gradYear < now.getFullYear();
}

// Plain-text badge for transactional email (app/api/replies/route.ts) — not
// the SVG rosette (components/social/VerifiedBadge.tsx). Deliberately text,
// not an embedded/inlined SVG: email client SVG support is inconsistent
// enough (older Outlook drops it outright) that a plain-text equivalent is
// the more reliably-rendering choice for a one-line notification email,
// even though it means the four tiers read as words here rather than as
// colour. "✓ UNH '27", "✓ UNH '27 ALUM", "✓ UNH · Faculty, Finance",
// "✓ Mentor, Managing Director XYZ Capital".
export function formatBadge(
  role: "student" | "faculty" | "mentor",
  schoolShortName: string | null,
  gradYear: number | null,
  affiliation: string | null,
  now: Date = new Date(),
): string {
  if (role === "mentor") {
    return affiliation ? `✓ Mentor, ${affiliation}` : "✓ Mentor";
  }
  if (role === "faculty") {
    const parts = [schoolShortName, affiliation ? `Faculty, ${affiliation}` : "Faculty"].filter(Boolean);
    return `✓ ${parts.join(" · ")}`;
  }
  const alum = gradYear != null && isAlumni(gradYear, now);
  const yearSuffix = gradYear != null ? String(gradYear).slice(-2) : "—";
  return `✓ ${schoolShortName ?? ""} '${yearSuffix}${alum ? " ALUM" : ""}`.trim();
}
