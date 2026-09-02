# Build Brief — Invite Acceptance Modal

Branch: `feat/social-v1`. **No merge and no PR without explicit sign-off.**

Design reference: `docs/invite-modal-mock.html` (save the mock from the chat there before
starting). It is a static mock, not code to lift — match the visual language, not the markup.

## What this is

Today, opening a space invite link joins you silently. Someone taps a link in a GroupMe, the
page loads, and they are suddenly inside a private room with no idea who invited them, what
the space is, or that they just joined something.

This adds one confirmation step: a modal that says who invited you, what the space is, and
gives you Join or Decline.

## Behaviour by arrival state

The route is `/j/[token]`. All existing arrival handling stays; the modal is inserted only
in the not-yet-a-member paths.

| State | Behaviour |
|---|---|
| Signed in, verified, **already a member** | **No modal.** Redirect straight to the space, exactly as today. |
| Signed in, verified, not a member | Show the modal. Join adds membership and lands on the space. Decline does not join. |
| Signed in, mid-onboarding | Finish onboarding first, then show the modal. |
| Signed out | Show the modal in its signed-out form, then run the existing signup flow. Join them to the space automatically once verification and onboarding complete. |
| Invalid or revoked token | The expired-link state. No join, no modal actions. |

The already-a-member case is deliberate. A confirmation prompt for something you have already
done is noise, and members re-open their own invite link often.

## Decline

Decline is **not recorded anywhere**. No database row, no flag, no notification to the owner
or the space.

- The person is simply not joined.
- The token is untouched and keeps working.
- Opening the same link again shows the same modal, and they can join then.

Consequence, accepted deliberately: someone who taps the link three times sees the modal three
times. That is the correct trade. Storing a refusal creates a state that has to be undone, and
surfacing declines to a club officer makes saying no socially costly inside a thirty-person
club.

Do not add a "don't show again", a dismissed-invites table, or any owner-facing view of who
declined.

## What the modal shows

**Inviter.** Avatar, name, and verified school badge of the person whose link it is. Derive
this from the space's invite token owner — confirm empirically what the schema actually gives
you here. If the token does not currently carry an inviter, fall back to the **space owner**
and say so, rather than inventing a column.

**The space.** Name, description, a private indicator, member avatars, member count. Read-only.
A non-member is being shown this before they join, so **check what a non-member is actually
permitted to read under the current RLS policies.** If the row is not readable pre-join, the
route needs a `security definer` function returning only these public-facing fields for a valid
token — name, description, member count, avatars, inviter — and nothing else. Do not loosen an
existing policy to make this work.

**One line of context.**
- Signed in: posts are visible to members only, and anything you write stays in the space
  unless you publish it to the feed yourself.
- Signed out: you will need a verified school email first; the invite is held so you land
  inside the space.

**Actions.** Decline (quiet) and Join space (primary). Signed out, the primary reads
"Verify and join" — it must not promise a join it cannot yet perform.

**Result states.** Joined, declined, and expired-link, per the mock.

## Design

Social surface, so the loosened treatment applies: ~7–10px radii, pill buttons, circular
avatars, IBM Plex Mono for the small uppercase labels and counts, Inter for everything else.
Navy/cream/gold, both themes first-class. Calm and declarative — no exclamation marks, no
"You're invited!", no celebration.

On mobile the modal should sit as a bottom sheet, since a phone is the device this link gets
opened on. Full-width action buttons at that width.

Accessibility: `role="dialog"`, `aria-modal`, focus moves into the modal on open and is
trapped, Escape behaves as Decline, visible focus rings, animation suppressed under
`prefers-reduced-motion`.

## Gotchas that apply here

- **`error.tsx` boundaries are unreliable in this Next 16 + Turbopack setup.** Handle a bad or
  revoked token as a normal 200 render with the expired-link state. Do not throw.
- **This version cannot set a cookie from a plain page render.** The signed-out path already
  carries the token through signup as a query param — keep that mechanism, do not replace it.
- Read `node_modules/next/dist/docs/` before writing anything touching routing, caching, or
  metadata. Training-data assumptions about this version are wrong often enough to matter.
- No rating, score, or track record anywhere. Member count is a count, not a ranking.

## Done means

- Opening your own space's link as an existing member goes straight to the space with no modal.
- A non-member sees the modal with the correct inviter, space name, description, and member
  count.
- Join adds the membership row and lands on the space.
- Decline joins nothing, writes nothing, notifies nobody.
- Re-opening the same link after declining shows the modal again and Join still works.
- Signed out: modal, then signup, then landing inside the space.
- A revoked or regenerated token shows the expired state and never joins.
- **A non-member cannot read space posts or replies at any point in this flow** — verify by
  querying the API directly as a non-member and signed out, not by reading policy text.
- Keyboard-only completion of both Join and Decline.
- Renders correctly at 375px wide in both light and dark.
- `npx tsc --noEmit` and `npm run build` pass, no new lint errors.
- `master` untouched.

## Raise rather than decide

- If the invite token has no inviter and the space owner is the only available name, flag it.
  Naming the wrong person on an invitation is worse than naming none.
- If showing member avatars pre-join means exposing member identities to anyone holding a
  leaked link, stop and ask before building it. Count alone may be the safer default.
