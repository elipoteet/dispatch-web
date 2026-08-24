"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SpaceNavItem } from "@/lib/social/spaces";
import { Avatar } from "./Avatar";

export type NavProfile = {
  handle: string;
  displayName: string;
  schoolShortName: string;
  gradYear: number;
  avatarUrl: string | null;
};

// Deterministic per-space color, hashed from the space's id — there's no
// stored color column for Spaces (unlike schools' color_primary), so this
// is a stand-in that still gives a mixed nav several visually distinct
// dots to tell Spaces apart at a glance, without a schema change.
function spaceColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 55%, 42%)`;
}

export function SocialNav({
  spaces,
  canCreateSpace,
  profile,
}: {
  spaces: SpaceNavItem[];
  canCreateSpace: boolean;
  profile: NavProfile | null;
}) {
  const pathname = usePathname();

  return (
    <nav className="social-nav" aria-label="Primary">
      <Link href="/" className={`nav-link${pathname === "/" ? " active" : ""}`}>
        Feed
      </Link>
      <Link href="/research" className="nav-link">
        Research
      </Link>

      {canCreateSpace && (
        <>
          <div className="nav-section-label">Spaces</div>
          {spaces.map((space) => {
            const href = `/s/${space.slug}`;
            return (
              <Link key={space.id} href={href} className={`nav-space-row${pathname === href ? " active" : ""}`}>
                <span className="nav-space-dot" style={{ backgroundColor: spaceColor(space.id) }} aria-hidden="true" />
                <span className="nav-space-name">{space.name}</span>
                {space.unreadCount > 0 && <span className="nav-space-count">{space.unreadCount}</span>}
              </Link>
            );
          })}
          <Link href="/s/new" className="nav-new-space">
            + New space
          </Link>
        </>
      )}

      {/* Matches the prototype's .me box — under Spaces, not above it,
          per your placement. "Covers X" (a beat) is left out: beats are
          part of the deferred Themes work (product-spec.md's Deferred
          list), so there's no real data to show there yet — school and
          class year are what's actually real. */}
      {profile && (
        <Link href={`/@${profile.handle}`} className="nav-me">
          <Avatar avatarUrl={profile.avatarUrl} displayName={profile.displayName} className="avatar--sm" />
          <div className="nav-me-id">
            <div className="nav-me-name">{profile.displayName}</div>
            <div className="nav-me-handle">@{profile.handle}</div>
            <div className="nav-me-stat">
              {profile.schoolShortName} &rsquo;{String(profile.gradYear).slice(-2)}
            </div>
          </div>
        </Link>
      )}
    </nav>
  );
}
