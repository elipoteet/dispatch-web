import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/social/EmptyState";

export const metadata: Metadata = {
  title: "Join a Space",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

// Resolves an invite link. Four cases, only two of which the brief names
// explicitly:
//   - signed out -> validate the token, then send them through signup,
//     carrying it as ?invite= so it survives to /onboarding (see
//     EmailCodeForm/OnboardingForm — a cookie can't be set from a plain
//     page render in this Next.js version, only from a Server Function or
//     Route Handler, so this carries the token in the URL instead).
//   - signed in, no profiles row yet (mid-onboarding — the same state
//     SocialHeader.tsx already branches on) -> same as signed out, but
//     straight to /onboarding since there's already a session.
//   - signed in and onboarded -> join now (join_space_via_token is
//     idempotent, so "already a member" is a no-op, not an error) and go
//     straight to the space.
//   - invalid or revoked token -> a plain page saying so, never a hard
//     error or a confusing bounce.
export default async function JoinSpacePage(props: Props) {
  const { token } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { data } = await supabase.rpc("get_space_by_invite_token", { p_token: token });
    if (!data || data.length === 0) return <InvalidInvite />;
    redirect(`/signup?invite=${encodeURIComponent(token)}`);
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) {
    const { data } = await supabase.rpc("get_space_by_invite_token", { p_token: token });
    if (!data || data.length === 0) return <InvalidInvite />;
    redirect(`/onboarding?invite=${encodeURIComponent(token)}`);
  }

  const { data: joined, error } = await supabase.rpc("join_space_via_token", { p_token: token });
  if (error || !joined || joined.length === 0) return <InvalidInvite />;
  redirect(`/s/${joined[0].slug}`);
}

function InvalidInvite() {
  return <EmptyState headline="This link isn't valid anymore." sub="Ask whoever shared it for a new one." />;
}
