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
      .select("handle, display_name, grad_year, avatar_url, school:schools ( short_name, color_primary )")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      const school = data.school as unknown as { short_name: string; color_primary: string | null } | null;
      profile = {
        handle: data.handle,
        displayName: data.display_name,
        gradYear: data.grad_year,
        schoolShortName: school?.short_name ?? "",
        schoolColorPrimary: school?.color_primary ?? null,
        avatarUrl: data.avatar_url,
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
