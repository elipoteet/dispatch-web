"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Replaces the left rail below 900px — "thumb-reachable... Feed, Spaces,
// Profile" (docs/phase-four.md Part 3). Only rendered signed-in and
// onboarded: Spaces and Profile are both account-gated destinations that
// don't apply to a signed-out visitor, and the header's Sign In/Sign Up
// buttons (already visible at every width) are that visitor's actual
// navigation, not a third bottom-nav item that would do nothing for them.
//
// Phone pass: Research was missing entirely — desktop's SocialNav.tsx has
// Feed/Research/Spaces, but this only had Feed/Spaces/Profile, leaving
// phone users with no way to reach /research except clicking a ticker
// inside a post. Added as the 2nd tab (matching SocialNav's order), with
// Profile staying last, matching where every mainstream mobile app's
// tab bar puts "you."
export function MobileNav({ handle }: { handle: string }) {
  const pathname = usePathname();
  const profileHref = `/@${handle}`;

  return (
    <nav className="mobile-nav" aria-label="Primary">
      <Link href="/" className={`mobile-nav-item${pathname === "/" ? " active" : ""}`}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 3h12M2 8h12M2 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Feed
      </Link>
      <Link href="/research" className={`mobile-nav-item${pathname.startsWith("/research") ? " active" : ""}`}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.2 10.2 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Research
      </Link>
      <Link href="/spaces" className={`mobile-nav-item${pathname.startsWith("/spaces") || pathname.startsWith("/s/") ? " active" : ""}`}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Spaces
      </Link>
      <Link href={profileHref} className={`mobile-nav-item${pathname === profileHref ? " active" : ""}`}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2.5 14a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Profile
      </Link>
    </nav>
  );
}
