import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SocialHeader } from "@/components/social/SocialHeader";
import type { HeaderProfile } from "@/components/social/SocialHeader";
import { SocialNav } from "@/components/social/SocialNav";
import { MobileNav } from "@/components/social/MobileNav";
import { Footer } from "@/components/social/Footer";
import { getUserSpaces } from "@/lib/social/spaces";
import type { SpaceNavItem } from "@/lib/social/spaces";

// Chrome for the new campus-social surface — /, /signup, /login,
// /onboarding, /p/[id], /u/[handle] (public URL /@handle, see
// next.config.ts), /s/[slug], /s/new, /j/[token]. Header on top, a left
// nav (phase three — Feed/Research/Spaces, new chrome for this surface,
// first of its kind here) plus the page content in a sidebar+content grid
// below it (.social-shell, app/globals.css). Scoped under .social so the
// loosened radius stays out of the equity-research surface in
// app/(research)/.

// Overrides the root layout's title/openGraph/twitter defaults — all
// three still say "The Dispatch — Equity Research," correct for the
// retired research surface under app/(research)/, which keeps its own
// identity untouched — for every page nested under this layout. Per
// Next's metadata merging rules (root → nested layout → page, evaluated
// in that order, duplicate keys replaced by the later one), the closer
// layout wins for any descendant page that doesn't set the same key
// itself. `title` has real templating (`%s — Dispatch Social`); OG/
// Twitter titles don't, so those are flat defaults, matching the same
// level of specificity the root already gives its own surface. Found
// live: without this, a page's own explicit `description` override
// (e.g. /research's fix for the same underlying leak) still left the
// *title* shown in a shared link preview reading the old name.
export const metadata: Metadata = {
  title: {
    template: "%s — Dispatch Social",
    default: "Dispatch Social",
  },
  openGraph: {
    title: "Dispatch Social",
    siteName: "Dispatch Social",
  },
  twitter: {
    title: "Dispatch Social",
  },
};

export default async function SocialLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetched server-side so the badge/handle in the header don't need a
  // second client-side round trip — useAuth() still drives the reactive
  // signed-in/out toggle itself (see SocialHeader), this just supplies the
  // profile data useAuth()'s raw Supabase user object doesn't carry.
  let profile: HeaderProfile | null = null;
  let spaces: SpaceNavItem[] = [];
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "handle, display_name, grad_year, avatar_url, role, affiliation, school:schools ( short_name, color_primary )",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      const school = data.school as unknown as { short_name: string; color_primary: string | null } | null;
      profile = {
        handle: data.handle,
        displayName: data.display_name,
        gradYear: data.grad_year,
        schoolShortName: school?.short_name ?? null,
        schoolColorPrimary: school?.color_primary ?? null,
        avatarUrl: data.avatar_url,
        verifiedRole: data.role ?? "student",
        affiliation: data.affiliation ?? null,
      };
      // Only fetched once onboarding is actually done (profile exists) —
      // the Spaces nav section means nothing to a mid-onboarding user.
      spaces = await getUserSpaces(supabase, user.id);
    }
  }

  return (
    <div className="social">
      <SocialHeader profile={profile} />
      <div className="social-shell">
        <SocialNav spaces={spaces} canCreateSpace={Boolean(profile)} profile={profile} />
        <main className="social-main">{children}</main>
      </div>
      <Footer />
      {profile && <MobileNav handle={profile.handle} />}
      {/* Ticker tape turned off — Eli's call, "useless for right now."
          Not deleted: .social-tape's CSS and app/api/tape/route.ts are
          untouched, so this is a one-line revert if it comes back. */}
    </div>
  );
}
