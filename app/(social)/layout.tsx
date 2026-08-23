import { createClient } from "@/lib/supabase/server";
import { SocialHeader } from "@/components/social/SocialHeader";
import type { HeaderProfile } from "@/components/social/SocialHeader";
import { Footer } from "@/components/social/Footer";
import { TickerTape } from "@/components/home/TickerTape";

// Chrome for the new campus-social surface — /, /signup, /login,
// /onboarding, /p/[id], /u/[handle] (public URL /@handle, see
// next.config.ts). Deliberately minimal: just the brand mark and
// sign-in/out state, no research-desk nav. Scoped under .social so the
// loosened radius (defined in app/globals.css) stays out of the
// equity-research surface in app/(research)/.
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
    }
  }

  return (
    <div className="social">
      <SocialHeader profile={profile} />
      <main className="social-main">{children}</main>
      <Footer />
      {/* Ambient status, not the point of the page — fixed to the viewport
          bottom on desktop, hidden on mobile (.social-tape, app/globals.css)
          rather than competing with the composer and browser chrome there.
          Same 5-symbol/20-min-cached app/api/tape/route.ts recovered from
          git history; see that file for the rate-limit history. */}
      <div className="social-tape">
        <TickerTape />
      </div>
    </div>
  );
}
