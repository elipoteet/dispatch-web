"use client";

import { usePathname } from "next/navigation";

// app/(social)/layout.tsx is the only layout under app/(social)/ and wraps
// every route, so it has no server-side way to know which page is active.
// This is the same "client component branches on the route" shape
// SocialHeader.tsx used (via usePathname) for its brand-word decision
// before the rebrand made that unconditional — reused here instead of
// restructuring routes into new groups, which this Next version's real
// breaking changes from training data (AGENTS.md) make riskier than it
// looks.
//
// `/@` covers /u/[handle], served at the public /@handle URL via
// next.config.ts's rewrite — transparent to usePathname(). `/s/(?!new)`
// excludes the Space-creation form. `/research` is exact — NOT
// /research/[ticker], which already has its own "The numbers" block for
// that one ticker; a general most-traded rail beside it risks a
// redundant/confusing duplicate row if that ticker happens to also be one
// of the day's top 6 (docs/phase-eight.md calls this one a judgment call).
const RAIL_ROUTES = [/^\/$/, /^\/p\//, /^\/@/, /^\/spaces$/, /^\/s\/(?!new)/, /^\/research$/];

export function RailVisibility({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  // signedIn keeps the rail out from behind the sign-in/LandingScreen
  // overlay at "/" — that screen covers the full viewport, but the rail
  // shouldn't even be in the DOM behind it (docs/phase-eight.md: "the
  // sign-in screen, clearly not").
  if (!signedIn) return null;
  if (!RAIL_ROUTES.some((re) => re.test(pathname))) return null;
  return <>{children}</>;
}
