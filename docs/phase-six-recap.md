# Phase Six Recap — for the Claude Project, ahead of Phase Seven

Paste this into the Claude Project's knowledge alongside `product-spec.md` (v2),
`phase-five.md`, `phase-five-recap.md`, `phase-six.md`, `docs/badges-design.html`,
`docs/landing-design.html`, `docs/feedback-log.md`, and `claude-project-context.md`, all of
which live in this repo's `docs/`. Covers the landing page and verified roles — both came out
of the same mentor conversation logged in `feedback-log.md`, both Eli's explicit calls — on
`feat/social-v1`, pushed, **not merged**. `master`/production untouched throughout.

## What shipped

**Section A — the landing page.** A signed-out visitor at the site root now sees a sign-in
screen instead of the feed: logo, name, one sentence, a school-email field, Continue.
Entering an email lands directly on the code-entry step in the same screen — no second trip
to `/signup` to type the same address again, since it feeds the existing
`/api/auth/request-code` route and reuses `verifyOtp` exactly as `EmailCodeForm` does, just
with the published reference's own dark, full-bleed visual language. Scoped to exactly this —
`!user`, on the feed page's own render — rather than a layout- or middleware-level rule, per
the brief's own explicit warning that a broader rule is exactly how this becomes a blanket
redirect that breaks `/j/[token]` and every other signed-out-reachable route. Metadata flips
correctly with it: `robots.index` is `true` only for the signed-out screen, `false` for the
signed-in feed behind it, unchanged from before. Uses the site's real `Logo` component rather
than the reference's own (older, different) inline mark — a deliberate, reasoned deviation
for brand consistency.

**Section B — verified roles.** `profiles.role`: `student | faculty | mentor`, default
`student`. Alumni stays **derived**, never stored — still comes from `grad_year <` the
current year everywhere, the same way it always did; storing it as a fourth role value would
have been a second source of truth for the same fact. Faculty and mentor are granted, never
self-selected — enforced by a database trigger, not just the UI, and confirmed by an actual
attempt from a signed-in client, not by reading the policy (see below). A mentor has no
school email at all, so the domain-gated signup flow was extended with a maintained
allowlist (`mentor_allowlist`, service-role-only, same "zero client-readable policies"
pattern as the existing rate-limit table) — being on it unlocks a signup *code*, and the same
insert trigger that blocks self-granting a role also auto-promotes an allowlisted email to
`mentor` at the moment their account row is created, so there's no separate manual step once
they've been added. `VerifiedBadge.tsx`: one rosette-check SVG, four colours
(`--v-student`/`--v-alum`/`--v-faculty`/`--v-mentor`), the same light/dark/OS-preference
triple-block pattern as every other themed token in this file. `IdentityBadge.tsx` replaces
`SchoolBadge` (deleted) everywhere a name appears — one component computing both the tier and
the meta text together, so a surface can't render one without the other the way the "from a
space" kicker once could.

## Real things found while building, and after

- **The landing screen was rendering *underneath* the site header**, found from a real
  screenshot days after this phase had already shipped and been called done. `LandingScreen`
  is `position: fixed; z-index: 500`, meant to cover the whole viewport including the header —
  but `app/globals.css` has a bare, global `main { position: relative; z-index: 2 }` rule
  (predates this phase, likely written for the retired research product's own layering). That
  rule gives every `<main>` its own stacking context, which traps any fixed-position
  descendant's z-index inside it — so the landing screen's z-index 500 was only ever competing
  at z-index 2 against the header's z-index 40, and losing. A React portal straight to
  `document.body` was the first fix tried, and it does escape the trap — but it also stops the
  screen from being in the server-rendered HTML at all until the client hydrates, which
  directly undermines the one requirement this phase's own brief places on this exact page:
  that it be indexable. Reverted that in favor of fixing the actual source —
  `.social-main { z-index: auto }`, a class selector beating the bare element selector, so
  only this surface's `<main>` is affected and the research surface's own layering is
  untouched. The same trap turned out to also apply to `.promote-scrim` (the app's one
  existing modal), which the same fix covers. Verified live: the screen is back in the
  server-rendered HTML (curl-confirmed) and the served CSS bundle confirms the override ships.
- **A related, still-open gap found in the same pass**: the header/nav/footer are still
  rendered in the DOM underneath the overlay (by design — nothing outside the feed page's own
  render is meant to know this screen exists), which means a keyboard user could tab into
  navigation links hidden behind it. Fixed by marking that subtree `inert` while the screen is
  mounted, same imperative-DOM-effect shape as the existing body-scroll lock.
- **A signed-in user's own attempt to self-grant a role was tested directly, not assumed
  safe.** Got a real session for an existing account via the Supabase admin API (no OTP inbox
  needed) and issued a real `PATCH` setting `role: "mentor"` on that account's own row from an
  authenticated client — rejected with the trigger's own error message. Confirmed the
  account's role was unchanged afterward.
- **A full mentor signup was walked end to end for real**, not just read in the code: an email
  added to the allowlist, run through the real `/api/auth/request-code` route (confirmed no
  longer rejected as "not a recognized school"), a real session obtained, onboarded through
  the exact insert the mentor form sends. The resulting row came back with `school_id: null`,
  `grad_year: null`, `role: "mentor"`, and the allowlisted affiliation — all applied
  automatically, zero manual step. All test data (the fake profile, the auth account, the
  allowlist entry) deleted afterward.

## Known gaps / open items for whoever picks this up

- No admin UI exists for granting a role or maintaining the mentor allowlist — both are
  one-off SQL run by hand (or asked of Claude Code directly), same as every other one-off
  admin action this session. Not built because it wasn't asked for, not because it's hard.
- The one-viewport/no-scrollbar layout at exact pixel sizes (390×844, 1440×900) was never
  checked in a real browser, only reasoned through via CSS.
- Everything still open from `docs/phase-five-recap.md` is **still open** — nothing in this
  phase touched any of it.

## Where to look for more

- `docs/phase-six.md` — the brief this recap summarizes.
- `docs/phase-five-recap.md` — everything before this.
- `docs/state-of-play.md` — current overall status, audited against the live site.
