"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateHandle } from "@/lib/social/handle";
import { AuthSteps } from "./AuthSteps";

// docs/phase-six.md section B — an outside mentor has no school and no
// class year, so this skips both fields OnboardingForm.tsx asks for.
// Only reachable via app/(social)/onboarding/page.tsx's own check that
// the signed-in email is on mentor_allowlist (there is no other way to
// land here — the normal domain-match branch takes priority). role is
// never sent from here: the insert always requests the plain student
// default, and supabase/migrations/0014_roles.sql's own trigger is what
// actually promotes it to mentor server-side, based on that same
// allowlist — this form has no ability to request a role for itself.
//
// inviteToken/inviteConfirmed — a real gap found while building
// docs/invite-modal-build-brief.md: this form previously dropped an
// invite token silently (a mentor who clicked an invite link would sign
// up and just land on the plain feed, invite forgotten). Same handling
// as OnboardingForm.tsx now, mirrored exactly.
export function MentorOnboardingForm({
  userId,
  defaultDisplayName,
  inviteToken,
  inviteConfirmed,
}: {
  userId: string;
  defaultDisplayName: string;
  inviteToken?: string;
  inviteConfirmed?: boolean;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const handleError = validateHandle(handle);
    if (handleError) {
      setError(handleError);
      return;
    }
    if (!displayName.trim()) {
      setError("Enter a display name.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").insert({
      id: userId,
      handle: handle.trim().toLowerCase(),
      display_name: displayName.trim(),
    });
    setLoading(false);

    if (error) {
      if (error.code === "23505") {
        setError("That handle is already taken. Pick another.");
      } else {
        setError("That handle isn't available. Pick another.");
      }
      return;
    }

    if (inviteToken && inviteConfirmed) {
      const { data: joined } = await supabase.rpc("join_space_via_token", { p_token: inviteToken });
      if (joined && joined.length > 0) {
        router.push(`/s/${joined[0].slug}`);
        router.refresh();
        return;
      }
    } else if (inviteToken) {
      router.push(`/j/${encodeURIComponent(inviteToken)}`);
      router.refresh();
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="social-auth-wrap">
      <div className="social-auth-card">
        <AuthSteps current={2} />
        <h1>Set up your profile.</h1>
        <p className="sub">Just a handle and a display name — you&rsquo;re verified as a mentor, not a student.</p>

        <form onSubmit={handleSubmit}>
          <div className="social-field">
            <label htmlFor="mentorHandle">Handle</label>
            <input
              id="mentorHandle"
              type="text"
              required
              placeholder="jsmith"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
            />
            <div className="hint">3-20 characters: lowercase letters, digits, underscores.</div>
          </div>

          <div className="social-field">
            <label htmlFor="mentorDisplayName">Display name</label>
            <input
              id="mentorDisplayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {error && <div className="social-error">{error}</div>}

          <button className="social-btn social-btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Enter the feed"}
          </button>
        </form>
      </div>
    </div>
  );
}
