import type { CSSProperties } from "react";

// docs/phase-six.md section B, docs/badges-design.html (the published
// reference). One rosette, four colours — the shape never changes
// between tiers, so it always reads as "verified" at a glance; colour is
// what says which kind of person you're reading. One component, meant to
// be used everywhere a name appears (feed, post page, replies, profiles,
// space member lists, the digest email) — same lesson as the "from a
// space" kicker: if each surface has to remember to render it, some of
// them will forget.
export type VerifiedTier = "student" | "alumni" | "faculty" | "mentor";

const LABELS: Record<VerifiedTier, string> = {
  student: "Verified student",
  alumni: "Verified alum",
  faculty: "Verified faculty",
  mentor: "Verified mentor",
};

// Exact path data from docs/badges-design.html — twelve lobes, one path,
// scales cleanly from the 13px floor up to a profile header.
const ROSETTE_PATH =
  "M8 0.85A1.85 1.85 0 0 1 11.57 1.81A1.85 1.85 0 0 1 14.19 4.42A1.85 1.85 0 0 1 15.15 8" +
  "A1.85 1.85 0 0 1 14.19 11.57A1.85 1.85 0 0 1 11.57 14.19A1.85 1.85 0 0 1 8 15.15" +
  "A1.85 1.85 0 0 1 4.43 14.19A1.85 1.85 0 0 1 1.81 11.58A1.85 1.85 0 0 1 0.85 8" +
  "A1.85 1.85 0 0 1 1.81 4.42A1.85 1.85 0 0 1 4.42 1.81A1.85 1.85 0 0 1 8 0.85Z";
const CHECK_PATH = "M4.6 8.2l2.3 2.3 4.5-4.6";

// 13px is the documented floor — below that the lobes turn to mush and
// the check loses its corners. 15px is the standard feed-row size.
export function VerifiedBadge({ tier, size = 15 }: { tier: VerifiedTier; size?: number }) {
  return (
    <svg
      className={`vb vb--${tier}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={LABELS[tier]}
      style={{ verticalAlign: "-2px", flex: "none" } as CSSProperties}
    >
      <path className="ros" d={ROSETTE_PATH} />
      <path className="chk" d={CHECK_PATH} />
    </svg>
  );
}
