import { formatBadge, isAlumni } from "@/lib/social/badge";

// The dot is deliberately a separate element from the badge pill, not a
// recolor of it — some schools' colors will be nearly invisible against
// either the cream or dark background, so the badge's own contrast-checked
// styling stays untouched regardless of what color a school has. Falls
// back to the existing gold accent when colorPrimary is null, so adding a
// school without colors set never breaks anything.
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
  return (
    <span className="school-badge-group">
      <span
        className="school-color-dot"
        style={{ backgroundColor: colorPrimary || "var(--gold)" }}
        aria-hidden="true"
      />
      <span className={`school-badge${alum ? " school-badge--alum" : ""}`}>
        {formatBadge(shortName, gradYear)}
      </span>
    </span>
  );
}
