"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";

// docs/phase-six.md section A. What a signed-out visitor sees at the site
// root instead of the feed — a sign-in screen, not a marketing page. One
// viewport, no scrolling, no sections. A full-viewport fixed overlay
// rather than a change to app/(social)/layout.tsx or proxy.ts: the brief
// is explicit that this must live in the feed page's own render, and a
// layout-level or middleware-level branch is exactly how "signed out
// sees the pitch" risks becoming a blanket rule that breaks every other
// signed-out-reachable route (/j/[token] above all — see that section's
// "the part that will break things if you get it wrong"). This way nothing
// outside app/(social)/(feed)/page.tsx has to know this exists.
//
// The published reference (docs/landing-design.html) draws its own "D"
// mark rather than the site's real Logo component — an earlier draft,
// not the current brand. Using the actual Logo here instead is a real-
// reason deviation, not a missed detail: a second, different "D" glyph
// that only ever appears on this one screen would be its own small
// inconsistency the first time someone compares it to the header.
//
// Copy and the email→code shape are functionally identical to
// EmailCodeForm (same /api/auth/request-code, same verifyOtp, same
// "shouldCreateUser doesn't distinguish new vs. returning" note), just
// with the reference's own dark, full-bleed visual language instead of
// the light .social-auth-card — different enough that reusing that
// component directly would mean fighting its styling on every element.
//
// Real, live bug found via a screenshot: app/globals.css has a bare,
// global `main { position: relative; z-index: 2 }` rule (predates this
// component — likely the retired research surface's own layering need).
// That rule gives <main> its own stacking context, which traps anything
// nested inside it — including this component's own z-index:500 — so it
// only ever competed at z-index 2 against SocialHeader's z-index 40, and
// lost; the header rendered visibly on top instead of being covered.
// Fixed at the actual source (`.social-main { z-index: auto }` in
// globals.css, more specific than the bare element selector, so only
// this surface's <main> is affected) rather than here — a portal was the
// first fix tried, but it stops this screen from being in the server-
// rendered HTML at all until the client hydrates, which directly hurts
// the one thing docs/phase-six.md requires of this exact page: that it
// be indexable. The same stacking trap turned out to also apply to
// .promote-scrim (the one existing modal in this app) — the CSS fix
// covers that too, not just this screen.
export function LandingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "One viewport, no scrolling" — locks the real page (header/nav/shell/
  // footer, still present underneath this fixed overlay) from scrolling
  // while this is up, same pattern as useModalA11y's scroll lock.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  async function handleContinue(e: React.FormEvent) {
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
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="landing-screen">
      <div className="landing-card">
        <Logo size={46} />
        <h1 className="landing-h1">Dispatch Social</h1>
        <p className="landing-desc">Where college students argue about markets, under their real name and school.</p>

        {step === "email" ? (
          <form className="landing-form" onSubmit={handleContinue}>
            <label htmlFor="landingEmail">School email</label>
            <input
              id="landingEmail"
              type="email"
              autoComplete="email"
              required
              placeholder="you@unh.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <div className="landing-error">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Continue"}
            </button>
          </form>
        ) : (
          <form className="landing-form" onSubmit={handleVerify}>
            <label htmlFor="landingCode">
              Code sent to {email}.{" "}
              <button
                type="button"
                className="landing-switch"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </label>
            <input
              id="landingCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={12}
              placeholder="Enter the code from your email"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && <div className="landing-error">{error}</div>}
            <button type="submit" disabled={loading || code.trim().length === 0}>
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}

        <p className="landing-note">We&rsquo;ll send you a code. No password, and your email is never shown to anyone.</p>

        <div className="landing-foot">Not investment advice</div>
      </div>
    </div>
  );
}
