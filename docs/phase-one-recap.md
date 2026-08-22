# Phase One Recap — for the Claude Project, ahead of Phase Two

Paste this into the Claude Project's knowledge (alongside `product-spec.md`,
`claude-project-context.md`, and `phase-one.md`, all of which already live in
this repo's `docs/`) before starting phase two. Written so a fresh Claude
conversation — Project or Code — can pick up exactly where this left off
without re-deriving any of it.

## What shipped

Everything in `docs/phase-one.md`'s scope: school-email sign-in, post, reply,
edit within 12 hours, soft-delete with a tombstone, read the feed signed out.
Branch `feat/social-v1`, off `master`, pushed, **not merged** — no PR without
explicit sign-off, per the brief. `master`/production untouched throughout.

Built and live-tested end to end, including a real `@unh.edu` signup through
the actual production email path (not a workaround) — domain gate, rate
limiting, OTP send, code verify, onboarding, posting, replying, editing,
deleting, tombstoning, and a follow-up polish pass on copy/visual/identity
issues found by eye. `npx tsc --noEmit` and `npm run build` both pass as of
the last commit on the branch.

## Data model (live in Supabase)

`supabase/migrations/0006_social.sql` — `schools`, `profiles`, `posts`,
`replies`, plus `auth_code_requests` (a service-role-only rate-limit table,
not part of the phase-one spec itself but needed to ship the OTP route
responsibly). All four spec tables have RLS matching house style
(`{table}_{action}_own` policy naming, matching `0001`–`0003`'s
conventions). Two triggers do work RLS alone can't:

- `enforce_post_edit_window` — the 12-hour edit rule plus auto-setting
  `edited_at`, while still allowing soft-delete (`deleted_at`) at any time.
  A single RLS `USING` clause can't distinguish "editing" from "deleting"
  per-column; this can, and it's unbypassable regardless of what calls
  `UPDATE`.
- `enforce_reply_immutable_body` — replies have no `edited_at` column at
  all and no edit path, on purpose (per the brief); this trigger makes that
  a hard guarantee instead of just a missing button in the UI.

`schools` is seeded with UNH only (`unh.edu`, `alumni_email_retained: true`
— confirmed correct against `product-spec.md`'s explicit statement that UNH
retains alumni email addresses, this wasn't a guess). Additional schools get
inserted by hand in the Supabase SQL editor, same as everything else in this
migration file — this repo has never used the Supabase CLI's migration
runner.

## Auth

Supabase email OTP, gated server-side in `app/api/auth/request-code/route.ts`
before `signInWithOtp` is ever called: extracts the domain, checks it
against `schools`, refuses politely on no match. Also rate-limits by email
and IP (3/hour each, via `auth_code_requests`) so the route can't be used to
mail-bomb a stranger's real inbox — Supabase has its own built-in OTP limits
too, this is a second, app-controlled layer in front of them.

**Real-world deviation worth knowing**: the brief calls for a six-digit
code. This Supabase project actually issues **eight digits**, and there's no
"OTP length" setting exposed anywhere in its dashboard to force six. The
code-entry UI (`components/social/EmailCodeForm.tsx`) was originally
hardcoded to expect exactly 6 and had to be relaxed to accept whatever
length Supabase actually sends (up to 12, non-empty) — worth remembering if
a future session assumes "six-digit" is literal.

Session refresh runs through `proxy.ts` / `lib/supabase/proxy.ts`,
unmodified, as instructed — it's session-format-agnostic and needed no
changes for OTP.

## Routes

All under `app/(social)/` (a route group, URL-transparent):

- `/` — the feed
- `/signup`, `/login` — same underlying two-step (email, then code) form,
  different headline copy only
- `/onboarding` — handle/display-name/grad-year, only reachable with a
  session and no profile row
- `/p/[id]` — post + flat replies + reply box
- `/u/[handle]` — the real page behind the public `/@handle` URL

**`/@[handle]` can't be a literal folder** in this Next.js version — `@folder`
is the parallel-routes slot convention, not a URL segment, so it silently
never routes. The fix (standard, fully supported): a `rewrites()` entry in
`next.config.ts` (`/@:handle` → `/u/:handle`), so the address bar and every
internal link still say `/@handle`.

`app/(research)/` is the old equity-research surface (`/research`,
`/portfolio`, `/leaderboard`, `/about`, `/give`), moved into its own route
group with its own layout (chrome + `PortfolioProvider`/`CompetitionProvider`
moved out of the true root layout) — same URLs, unchanged behavior. The old
homepage's ticker-search hero at `/` was **deleted, not moved** (per
explicit instruction) since `/research` already covers that job; `/` is now
the feed. `TickerTape`/`api/tape` were dead code once the hero was gone and
got removed with it.

## Interface

Scoped entirely under a `.social` wrapper class in `app/globals.css` — new
loosened-radius tokens (`--social-r`, `--social-rs`, `--social-pill`) live
only there, so the equity-research surface's zero-border-radius rule (a
deliberate, strict brand constraint) is untouched. Reuses the existing
brand color tokens (`--navy`/`--cream`/`--paper`/`--muted`/`--rule`/`--gold`)
rather than inventing new ones.

A follow-up polish pass fixed: the header having no identity badge at all
(fetched server-side in `app/(social)/layout.tsx`, passed to
`SocialHeader`); avatar initials collapsing to one letter for any
single-token display name; composer placeholder duplicating the page
headline; empty states reading like a database placeholder instead of
editorial copy; a stray 8px grey divider under the composer (a leftover
prototype trick that didn't apply to this simpler layout); the primary
button using theme-inverting color tokens that made "enabled" and
"disabled" look too similar; and textareas not auto-growing with content.

## Known gaps / open items for whoever picks this up

- **`docs/legal-and-guidelines.md` was never provided** — referenced in a
  polish-pass request for a footer disclaimer line and `/disclaimer` +
  `/guidelines` pages. Not built; no placeholder/fabricated legal text was
  written in its place. Footer itself (with room for two more links beyond
  disclaimer/guidelines) is also not built yet, pending this.
- **`claude/alumni-verification.md`** (referenced in `phase-one.md` for the
  `schools.alumni_email_retained` field) was never provided either. Nothing
  currently reads that column, so this is inert, not blocking — but the
  actual verification-nuance logic it presumably describes was never built.
- **SPF on `dispatchresearch.com` never fully confirmed.** Resend marked the
  sending domain "verified" (DKIM alone appears sufficient for that status),
  but the `send` CNAME record (`send.forge.rmta.net`) never confirmed
  resolving at the authoritative Network Solutions nameserver even after
  the user re-added it. Doesn't block sending, but likely affects spam
  placement — worth a real check before this matters for actual users.
- **Two independent handle systems now exist**: `competition_profile.handle`
  (the old leaderboard feature) and the new `profiles.handle`. No shared
  uniqueness or reserved-word constraint between them — flagged, not fixed,
  per the original plan's explicit scope call.
- Visual/pixel-level correctness of the reply indentation, tombstone
  styling, and edited marker was verified by code review, not by an actual
  screenshot — this environment has no browser automation available to
  Claude Code. Confirmed structurally correct; not confirmed by eye by
  Claude itself.
- One real account exists in the dev database on purpose: `elipoteet`
  (`grad_year: 2028`), kept intentionally rather than cleared, as the
  founder's own first account.

## Where to look for more

- `docs/product-spec.md` — the full product vision and the phase 2–5 build
  order (composer types/change-my-mind field/position disclosure/pushback
  in phase two; ticker pages/thesis-tested events/redirects in phase three;
  full profile + network aggregates in phase four; themes in phase five).
- `docs/claude-project-context.md` — tech stack, brand rules, and the
  Next.js 16 gotchas list. Written for the equity-research product and
  predates this pivot; still accurate for anything about the stack itself,
  but its framing of "what this app does" is now the phase-out product, not
  the current one — worth a rewrite pass at some point, not done here.
- `docs/phase-one.md` — the original brief this recap summarizes.
