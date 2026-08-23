"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SpaceNavItem } from "@/lib/social/spaces";

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
}: {
  spaces: SpaceNavItem[];
  canCreateSpace: boolean;
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
    </nav>
  );
}
