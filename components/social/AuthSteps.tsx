// Small step-progress cue for the real (two-page) signup path: the
// email/code page (EmailCodeForm) is step 1, the separate /onboarding
// page is step 2 — matching the prototype's .su__steps bars in spirit,
// not its literal single-flow markup. The two real pages stay two real
// pages (the server doesn't know a person's school until the OTP
// verifies, so they can't honestly be merged into one continuous flow the
// way the prototype's generic mock does) — this only borrows the visual
// rhythm of "you're partway through something," not the structure.
// Login has no such flow (one step, no progress to show), so this is
// only ever rendered on the signup and onboarding pages.
export function AuthSteps({ current }: { current: 1 | 2 }) {
  return (
    <div className="auth-steps" aria-hidden="true">
      <span className={`auth-step${current >= 1 ? " on" : ""}`} />
      <span className={`auth-step${current >= 2 ? " on" : ""}`} />
    </div>
  );
}
