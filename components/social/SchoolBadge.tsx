import { isAlumni } from "@/lib/social/badge";

// The school's color tints the abbreviation and grad year themselves,
// not a separate dot next to the badge — tried the dot first, but with
// only one school's color live it read as decorative rather than
// informative. Falls back to the existing gold accent when colorPrimary
// is null, so a school with no colors set never renders unstyled text.
// The checkmark stays the badge's own default/alum color regardless, so
// it still reads as a distinct "verified" mark rather than part of the
// school's own color.
//
// Set as a --school-accent custom property, not a literal `color`, so
// app/globals.css's [data-theme="dark"] rule can still win: most school
// colors (UNH's navy blue, e.g.) are unreadable against a dark badge, so
// dark mode ignores colorPrimary entirely and always shows near-white
// instead — an inline `color` couldn't be overridden by a stylesheet rule
// at all, only another inline style.
export function SchoolBadge({
  shortName,
  gradYear,
  colorPrimary,
}: {
  shortName: string;
  gradYear: number;
  colorPrimary?: string | null;
}) {
  const alum = isAlumni(gradYear);
  const yearSuffix = String(gradYear).slice(-2);
  const yearLabel = `'${yearSuffix}${alum ? " ALUM" : ""}`;

  return (
    <span className={`school-badge${alum ? " school-badge--alum" : ""}`}>
      <span>✓</span>{" "}
      <span
        className="school-badge-school"
        style={{ "--school-accent": colorPrimary || "var(--gold)" } as React.CSSProperties}
      >
        {shortName} {yearLabel}
      </span>
    </span>
  );
}
