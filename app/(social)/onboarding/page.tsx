import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { OnboardingForm } from "@/components/social/OnboardingForm";
import { MentorOnboardingForm } from "@/components/social/MentorOnboardingForm";

export const metadata: Metadata = {
  title: "Set Up Your Profile",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ invite?: string }> };

// Only reachable with a session and no profile row yet, per
// docs/phase-one.md. Redirects to /signup with no session, and to / if a
// profile already exists — both preserve ?invite= so a Space invite link
// clicked mid-onboarding (or by someone who already has an account) still
// resolves. See app/(social)/j/[token]/page.tsx for where this token
// originates and why it travels as a query param rather than a cookie.
export default async function OnboardingPage(props: Props) {
  const { invite } = await props.searchParams;
  const inviteSuffix = invite ? `?invite=${encodeURIComponent(invite)}` : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup${inviteSuffix}`);
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    // Someone who already has an account opened an invite link while
    // signed in but somehow landed here — join now rather than just
    // bouncing to /. A failed/invalid token degrades to the normal "/"
    // redirect rather than blocking anything.
    if (invite) {
      const { data: joined } = await supabase.rpc("join_space_via_token", { p_token: invite });
      if (joined && joined.length > 0) {
        redirect(`/s/${joined[0].slug}`);
      }
    }
    redirect("/");
  }

  const domain = user.email?.split("@").pop()?.toLowerCase() ?? "";
  const { data: school } = await supabase
    .from("schools")
    .select("id, name")
    .eq("domain", domain)
    .maybeSingle();

  const defaultDisplayName = user.email?.split("@")[0] ?? "";

  if (!school) {
    // docs/phase-six.md section B: the other reason a signed-in user's
    // domain might not match a school — an outside mentor, allowlisted by
    // Eli (supabase/migrations/0014_roles.sql's mentor_allowlist). That
    // table has zero client-readable RLS policies, same as
    // auth_code_requests, so this has to use the service-role client —
    // the request-scoped `supabase` client above genuinely cannot read it.
    const service = createServiceRoleClient();
    const { data: mentorEntry } = await service
      .from("mentor_allowlist")
      .select("email")
      .eq("email", user.email?.toLowerCase() ?? "")
      .maybeSingle();

    if (mentorEntry) {
      return <MentorOnboardingForm userId={user.id} defaultDisplayName={defaultDisplayName} />;
    }

    // Reachable if a signed-in user with a non-school, non-allowlisted
    // email lands here — e.g. an existing equity-research account signed
    // in with Google using a non-.edu address. The OTP flow itself never
    // gets a session for an unrecognized, non-allowlisted domain in the
    // first place (see app/api/auth/request-code/route.ts), so this is a
    // clear message rather than a broken form for that edge case.
    return (
      <div className="social-auth-wrap">
        <div className="social-auth-card">
          <h1>This email isn&rsquo;t a supported school.</h1>
          <p className="sub">
            {user.email} isn&rsquo;t associated with a school Dispatch recognizes yet. Sign up with
            your school email instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingForm
      userId={user.id}
      schoolId={school.id}
      defaultDisplayName={defaultDisplayName}
      inviteToken={invite}
    />
  );
}
