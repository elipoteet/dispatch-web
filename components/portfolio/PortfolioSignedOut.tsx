"use client";

import { useAuthModal } from "@/components/auth/AuthModalContext";

export function PortfolioSignedOut() {
  const { open } = useAuthModal();

  return (
    <div className="phase-stub">
      <div className="label">Sign In Required</div>
      <h2>Sign in to see this work.</h2>
      <p>
        The portfolio itself isn&rsquo;t built yet (Phase 4), but signing in here is a good way to
        confirm auth persists across a reload.
      </p>
      <button className="auth-submit" style={{ marginTop: 20, width: "auto", padding: "12px 24px" }} type="button" onClick={() => open("sign-in")}>
        Sign In
      </button>
    </div>
  );
}
