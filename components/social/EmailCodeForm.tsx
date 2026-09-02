"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthSteps } from "./AuthSteps";

type Step = "email" | "code";

// Real launch-risk bug, not a Supabase problem: app/api/auth/request-code
// caps at 3 requests per email AND 3 per IP per hour (the IP cap is the
// sharp one — campus/club WiFi means many people share one IP, so a
// single confused person tapping "Send code" repeatedly because nothing
// visibly happened can burn through the WHOLE NETWORK's hourly budget,
// locking out everyone else on it, not just themselves). The button
// previously just flashed "Sending…" for the one in-flight request and
// then either sat there again (after an error) or the form moved on to
// the code step — nothing stopped someone from immediately going back
// via "Use a different email" and tapping Send again. This cooldown is
// deliberately NOT per-email: it has to survive switching email/typo-ing
// a retry too, since the thing actually at risk (the shared IP's budget)
// doesn't care which address the requests were for.
const RESEND_COOLDOWN_SECONDS = 60;

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
//
// inviteToken, when present, is only ever carried forward to /onboarding
// — this form never joins a space itself. It arrives via /j/[token]'s
// redirect to /signup?invite=..., not a cookie: Next.js can't set a
// cookie from a plain page render (only a Server Function or Route
// Handler), so the token travels in the URL through this step instead.
export function EmailCodeForm({
  mode,
  inviteToken,
  inviteConfirmed,
}: {
  mode: "signup" | "login";
  inviteToken?: string;
  // See app/(social)/signup/page.tsx's comment — only ever true when this
  // form was reached via InviteModal's "Verify and join" button.
  inviteConfirmed?: boolean;
}) {
  const router = useRouter();
  const copy = COPY[mode];
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a code has actually been sent at least once — never reset by
  // "Use a different email", by design (see RESEND_COOLDOWN_SECONDS
  // comment above). null = no code sent yet this session.
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  const inCooldown = cooldownEndsAt !== null && secondsLeft > 0;
  const hasSentACode = cooldownEndsAt !== null;

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (inCooldown) return; // belt-and-suspenders — the disabled button already blocks this
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
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
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
    // and bounces to / (or, with an invite token, straight into the
    // space, or back to the invite modal if it was never confirmed) if
    // so — see app/(social)/onboarding/page.tsx.
    const onboardingUrl = inviteToken
      ? `/onboarding?invite=${encodeURIComponent(inviteToken)}${inviteConfirmed ? "&confirmed=1" : ""}`
      : "/onboarding";
    router.push(onboardingUrl);
    router.refresh();
  }

  return (
    <div className="social-auth-wrap">
      <div className="social-auth-card">
        {mode === "signup" && <AuthSteps current={1} />}
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
            {hasSentACode && (
              <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
                {inCooldown
                  ? `Code sent — you can request another in ${secondsLeft}s.`
                  : "You can request another code now."}{" "}
                Check your spam folder if you don&rsquo;t see it.
              </p>
            )}
            <button className="social-btn social-btn-primary" type="submit" disabled={loading || inCooldown}>
              {loading ? "Sending…" : inCooldown ? `Resend available in ${secondsLeft}s` : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p className="social-field" style={{ marginTop: 4 }}>
              <span className="hint">
                Code sent to {email}. Check your spam folder if you don&rsquo;t see it.{" "}
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
