"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

const COPY = {
  signup: {
    heading: "Create your account.",
    sub: "Sign up with your school email — you'll get a one-time code.",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
  login: {
    heading: "Sign in.",
    sub: "Enter your school email and we'll send you a one-time code.",
    switchPrompt: "New here?",
    switchLabel: "Sign up",
    switchHref: "/signup",
  },
} as const;

// Not hardcoded to 6 — this Supabase project's actual OTP length turned
// out to be 8 digits in testing (no length setting exposed in the
// dashboard to force 6, despite docs/phase-one.md's "six digit code"
// framing). Accept any reasonable numeric length rather than asserting a
// specific one that doesn't match reality; Supabase's own verifyOtp call
// is the real validator, not this input.
const MAX_CODE_LENGTH = 12;

// Shared by /signup and /login — Supabase's signInWithOtp doesn't actually
// distinguish new vs. returning users at the request step (see
// app/api/auth/request-code/route.ts), so the underlying flow is
// identical; only the copy differs. See docs/phase-one.md's "Auth" section.
export function EmailCodeForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const normalized = email.trim().toLowerCase();
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setEmail(normalized);
      setCode("");
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Onboarding itself decides whether this user already has a profile
    // and bounces to / if so — see app/(social)/onboarding/page.tsx.
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="social-auth-wrap">
      <div className="social-auth-card">
        <h1>{copy.heading}</h1>
        <p className="sub">{copy.sub}</p>

        {step === "email" ? (
          <form onSubmit={handleRequestCode}>
            <div className="social-field">
              <label htmlFor="socialEmail">School email</label>
              <input
                id="socialEmail"
                type="email"
                autoComplete="email"
                required
                placeholder="you@unh.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <div className="social-error">{error}</div>}
            <button className="social-btn social-btn-primary" type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p className="social-field" style={{ marginTop: 4 }}>
              <span className="hint">
                Code sent to {email}.{" "}
                <button
                  type="button"
                  className="social-auth-switch"
                  style={{ display: "inline", marginTop: 0 }}
                  onClick={() => {
                    setStep("email");
                    setError(null);
                  }}
                >
                  Use a different email
                </button>
              </span>
            </p>
            <div className="social-field">
              <label htmlFor="socialCode">Sign-in code</label>
              <input
                id="socialCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={MAX_CODE_LENGTH}
                placeholder="Enter the code from your email"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            {error && <div className="social-error">{error}</div>}
            <button
              className="social-btn social-btn-primary"
              type="submit"
              disabled={loading || code.trim().length === 0}
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}

        <div className="social-auth-switch">
          {copy.switchPrompt}{" "}
          <a href={copy.switchHref}>{copy.switchLabel}</a>
        </div>
      </div>
    </div>
  );
}
