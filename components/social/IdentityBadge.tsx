import type { CSSProperties, ReactNode } from "react";
import { VerifiedBadge } from "./VerifiedBadge";
import type { VerifiedTier } from "./VerifiedBadge";
import { isAlumni } from "@/lib/social/badge";
import type { VerifiedRole } from "@/lib/social/queries";

// Replaces SchoolBadge everywhere a name appears (docs/phase-six.md
// section B) — SchoolBadge assumed a school and a class year always
// exist, and a mentor has neither. One component so the rosette and its
// meta text can never come apart on one surface the way the "from a
// space" kicker once did.
export type IdentitySubject = {
  verifiedRole: VerifiedRole;
  schoolShortName: string | null;
  gradYear: number | null;
  schoolColorPrimary: string | null;
  affiliation: string | null;
};

function computeTier(subject: IdentitySubject): VerifiedTier {
  // Alumni stays derived, never stored — supabase/migrations/0014_roles.sql's
  // own comment explains why. Only a student can be an alum; faculty and
  // mentor have no "graduated" state.
  if (subject.verifiedRole === "student" && subject.gradYear != null && isAlumni(subject.gradYear)) {
    return "alumni";
  }
  return subject.verifiedRole;
}

function metaText(subject: IdentitySubject, tier: VerifiedTier): ReactNode {
  if (subject.verifiedRole === "system") {
    return "Automated";
  }
  if (subject.verifiedRole === "mentor") {
    // No school prefix — a mentor doesn't have one. Matches
    // docs/badges-design.html's mentor row: "Mentor · Equity research".
    return subject.affiliation ? `Mentor · ${subject.affiliation}` : "Mentor";
  }
  if (subject.verifiedRole === "faculty") {
    const parts = [subject.schoolShortName, subject.affiliation ? `Faculty, ${subject.affiliation}` : "Faculty"];
    return parts.filter(Boolean).join(" · ");
  }
  // student / alumni — same "'27" / "'27 ALUM" shape SchoolBadge always
  // rendered. gradYear is only null here for pre-0014 rows that
  // somehow lack it, which shouldn't exist for a student, but this
  // stays defensive rather than crashing on one.
  const yearSuffix = subject.gradYear != null ? String(subject.gradYear).slice(-2) : "—";
  return `${subject.schoolShortName ?? ""} '${yearSuffix}${tier === "alumni" ? " ALUM" : ""}`.trim();
}

export function IdentityBadge({ subject, size = 15 }: { subject: IdentitySubject; size?: number }) {
  const tier = computeTier(subject);
  return (
    <span className={`school-badge${tier === "alumni" ? " school-badge--alum" : ""}`}>
      <VerifiedBadge tier={tier} size={size} />{" "}
      <span
        className="school-badge-school"
        style={{ "--school-accent": subject.schoolColorPrimary || "var(--gold)" } as CSSProperties}
      >
        {metaText(subject, tier)}
      </span>
    </span>
  );
}
