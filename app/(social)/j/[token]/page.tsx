import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceInvitePreview } from "@/lib/social/spaces";
import { getProfileAuthorById } from "@/lib/social/queries";
import { InviteModal } from "@/components/social/InviteModal";

export const metadata: Metadata = {
  title: "Join a Space",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

// docs/invite-modal-build-brief.md. Resolves an invite link into one of
// five states — see InviteModal.tsx's own header comment for the modal
// itself; this page's job is just resolving which state applies and
// fetching what that state needs, never throwing (error.tsx boundaries
// are unreliable in this Next version — an invalid/revoked token is a
// plain 200 render, same discipline as every not-found path elsewhere in
// this app).
//
//   - Token doesn't resolve to a real, non-deleted space -> expired state.
//   - Signed out -> the confirm modal in its signed-out form. Previously
//     this redirected straight to /signup with zero confirmation; now
//     that redirect only happens once someone actually clicks "Verify and
//     join" inside the modal (carrying &confirmed=1, so onboarding knows
//     to auto-join afterward rather than showing this modal a second
//     time — see OnboardingForm.tsx/MentorOnboardingForm.tsx).
//   - Signed in, no profiles row yet (mid-onboarding) -> straight to
//     /onboarding, unchanged — this person has never seen the modal, so
//     onboarding redirects back here (no &confirmed=1) once the profile
//     form is done, and *that* visit is what shows the modal.
//   - Signed in, onboarded, already a member -> straight to the space,
//     no modal — a confirmation prompt for something already done is
//     noise, and members re-open their own invite link often.
//   - Signed in, onboarded, not a member -> the confirm modal.
export default async function JoinSpacePage(props: Props) {
  const { token } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const preview = await getSpaceInvitePreview(supabase, token);
  if (!preview) return <InviteModal state="expired" />;

  if (!user) {
    const owner = await getProfileAuthorById(supabase, preview.ownerId);
    return <InviteModal state="confirm" signedOut token={token} preview={preview} owner={owner ?? FALLBACK_OWNER} />;
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) {
    redirect(`/onboarding?invite=${encodeURIComponent(token)}`);
  }

  // Already a member? Straight to the space, no modal — RLS already lets
  // a member read their own membership row (is_space_member resolves
  // true for them), so this is a plain request-scoped query, no new
  // function needed.
  const { data: membership } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("space_id", preview.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membership) {
    redirect(`/s/${preview.slug}`);
  }

  const owner = await getProfileAuthorById(supabase, preview.ownerId);
  return <InviteModal state="confirm" token={token} preview={preview} owner={owner ?? FALLBACK_OWNER} />;
}

// Reached only if the owner's own profile row somehow can't be read
// (profiles_select_all is `using (true)`, fully public, so this should
// be unreachable in practice) — the brief is explicit that naming the
// wrong person is worse than naming none, so this renders as a plain
// "Space owner" line rather than guessing or crashing.
const FALLBACK_OWNER = {
  id: "",
  handle: "",
  displayName: "The space owner",
  gradYear: null,
  schoolShortName: null,
  schoolColorPrimary: null,
  avatarUrl: null,
  verifiedRole: "student" as const,
  affiliation: null,
};
