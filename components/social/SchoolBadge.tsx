import { formatBadge, isAlumni } from "@/lib/social/badge";

export function SchoolBadge({ shortName, gradYear }: { shortName: string; gradYear: number }) {
  const alum = isAlumni(gradYear);
  return (
    <span className={`school-badge${alum ? " school-badge--alum" : ""}`}>
      {formatBadge(shortName, gradYear)}
    </span>
  );
}
