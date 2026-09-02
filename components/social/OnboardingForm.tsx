"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateHandle } from "@/lib/social/handle";
import { AuthSteps } from "./AuthSteps";

const CURRENT_YEAR = new Date().getFullYear();
// Past years (alumni) through a few years out — "a list including past
// years" per docs/phase-one.md.
const GRAD_YEARS = Array.from({ length: 17 }, (_, i) => CURRENT_YEAR + 6 - i);

export function OnboardingForm({
  userId,
  schoolId,
  defaultDisplayName,
  inviteToken,
  inviteConfirmed,
}: {
  userId: string;
  schoolId: string;
  defaultDisplayName: string;
  inviteToken?: string;
  // True only when this account arrived via InviteModal's "Verify and
  // join" (docs/invite-modal-build-brief.md) — they already confirmed
  // intent to join before ever signing up, so auto-join below rather
  // than showing the modal a second time. False (the mid-onboarding
  // case: a session existed with no profile yet) means they've never
  // actually seen the modal, so send them to it now instead of joining
  // silently.
  inviteConfirmed?: boolean;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [gradYear, setGradYear] = useState(String(CURRENT_YEAR));
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
      school_id: schoolId,
      grad_year: Number(gradYear),
    });
    setLoading(false);

    if (error) {
      // Most likely cause in practice: the handle is already taken
      // (unique constraint) — the DB doesn't hand back a friendlier
      // message than this, so normalize it into one.
      if (error.code === "23505") {
        setError("That handle is already taken. Pick another.");
      } else {
        setError("That handle isn't available. Pick another.");
      }
      return;
    }

    // The profile row now exists, so join_space_via_token's "finish
    // setting up your profile first" check passes.
    if (inviteToken && inviteConfirmed) {
      // Already confirmed at the modal before signup — auto-join, no
      // second confirmation. A failed/invalid token degrades to the
      // normal "/" landing rather than blocking account creation, which
      // already succeeded — the invite was a bonus, not the primary
      // action here.
      const { data: joined } = await supabase.rpc("join_space_via_token", { p_token: inviteToken });
      if (joined && joined.length > 0) {
        router.push(`/s/${joined[0].slug}`);
        router.refresh();
        return;
      }
    } else if (inviteToken) {
      // Never actually confirmed via the modal (the mid-onboarding path)
      // — show it now instead of joining silently.
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
        <p className="sub">Handle, display name, and graduation year — then you&rsquo;re in.</p>

        <form onSubmit={handleSubmit}>
          <div className="social-field">
            <label htmlFor="onbHandle">Handle</label>
            <input
              id="onbHandle"
              type="text"
              required
              placeholder="jsmith27"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
            />
            <div className="hint">3-20 characters: lowercase letters, digits, underscores.</div>
          </div>

          <div className="social-field">
            <label htmlFor="onbDisplayName">Display name</label>
            <input
              id="onbDisplayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="social-field">
            <label htmlFor="onbGradYear">Graduation year</label>
            <select id="onbGradYear" value={gradYear} onChange={(e) => setGradYear(e.target.value)}>
              {GRAD_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
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
