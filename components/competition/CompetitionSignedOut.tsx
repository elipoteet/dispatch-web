"use client";

import { useAuthModal } from "@/components/auth/AuthModalContext";

export function CompetitionSignedOut() {
  const { open } = useAuthModal();

  return (
    <div className="phase-stub">
      <div className="label">Sign In Required</div>
      <h2>Sign in to compete.</h2>
      <p>
        Your competition handle, trades, and standing are tied to your account so they follow you
        across devices. Sign in to opt in.
      </p>
      <button
        className="auth-submit"
        style={{ marginTop: 20, width: "auto", padding: "12px 24px" }}
        type="button"
        onClick={() => open("sign-in")}
      >
        Sign In
      </button>
    </div>
  );
}
