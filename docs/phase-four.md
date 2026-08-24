# Phase Four Build Brief — Parity and Feel

August 2026. Follows `docs/phase-three.md`. **No new features.** Every product capability
already exists. This phase is about the site looking like the prototype and behaving like an
app rather than a website.

Read `docs/product-spec.md` (v2) for what the product is, and open `docs/prototype-v2.html`
in a browser as the visual reference.

## Part 1 — Visual parity

**Do the diff yourself.** Open `docs/prototype-v2.html` side by side with the running branch
and compare screen by screen. Do not assume the gap list below is complete; produce your own
and show it before changing anything.

Screens to compare, in order of how often someone will see them:

- The feed signed in, and the feed signed out
- A post card: avatar, name, school badge, type chip, timestamp, body, change-my-mind block,
  ticker card, reply and pushback row
- A reply, including the indent, the smaller avatar, and the pushback label
- The composer, including type pills, the attached ticker card, and the hint near the button
- A space page: header, private chip, member avatars, member count, owner chip, invite panel
- The promotion modal
- A profile page
- Signup and onboarding
- The empty and near-empty states

Where the prototype and the running site differ, the prototype wins unless the difference
exists for a real reason, in which case say so rather than silently keeping the current
version.

Spacing, type scale, and colour are as much of this as layout. A page that has the right
elements in the right order but the wrong rhythm still reads as unfinished.

## Part 2 — Feel

This is the part that makes it read as an app. Each item is a specific behaviour, not a
vibe.

**Nothing full-page reloads.** Posting, replying, pushing back, joining a space, adding an
avatar, toggling a notification setting. All of it happens in place. A full navigation after
an action is the single strongest tell that something is a website rather than an app.

**Optimistic updates.** A new post appears at the top of the feed the instant it is
submitted, before the server confirms. A reply appears under its post immediately. If the
request fails, roll it back visibly and say why. Never leave someone staring at a button
wondering whether it worked.

**Instant navigation.** Moving between the feed, a space, a post, and a profile should feel
immediate. Prefetch on hover and on viewport entry. No white flash between pages.

**Skeletons, not spinners.** When something is loading, show a content-shaped placeholder
that matches what is about to arrive. A spinner in the middle of an empty page reads as
broken; a skeleton reads as fast.

**No layout shift.** Avatars, ticker cards, and images reserve their space before they load.
Text should never jump after the page appears.

**Submitting states everywhere.** Every button that does something shows it is doing it, and
disables itself so nothing double-submits.

**Modals behave.** Escape closes them, clicking the backdrop closes them, focus moves into
them on open and returns on close, and the page behind does not scroll.

**Scroll position survives.** Opening a post and coming back should return you where you
were, not to the top.

**Pagination that does not jump.** If the feed grows past one screenful, load more without
moving what the reader is currently looking at.

## Part 3 — Mobile

Currently the weakest surface and the one that matters most, because a club officer will open
the invite link on a phone, in a group chat, standing up.

- Every screen works at 390px wide. Test at that width, not by resizing a desktop window.
- **Bottom navigation** rather than a left rail. Thumb-reachable. Feed, Spaces, Profile.
- No interaction may depend on hover, because there is no hover.
- Tap targets at least 44px.
- The composer is usable one-handed, and the keyboard does not cover the post button.
- The ticker tape stays hidden below 640px, as it is now.
- **Walk the whole invite flow on a real phone**: tap a link from a text message, sign up,
  verify, onboard, land inside the space. That is the exact path every member of the first
  club will take once, and it crosses four systems.

## The architectural note

The prototype is static HTML with client-side JavaScript. The running site is Next.js server
components. Getting the feel above means some components become client components with
optimistic state, which is a real trade-off rather than a free change.

Be deliberate about it. Convert the pieces that genuinely need interaction, keep the rest on
the server, and say which is which in the plan. Do not turn the whole app into a client
bundle to get a smooth reply box.

## Explicitly not in scope

No new product features of any kind. Not themes, not watchlists, not ticker research pages,
not clickable cashtags, not thesis-tested events, not network aggregates, not direct
messages, not real-time chat, not reactions, not a space directory.

If something on that list seems necessary to make a screen feel finished, say so and stop.
Do not build it.

## Done means

- A written diff between the prototype and the running site, produced before any changes, and
  every item on it either closed or explicitly declined with a reason.
- Posting, replying, and pushing back happen without a full page navigation.
- A new post or reply appears immediately and rolls back visibly on failure.
- Loading states are skeletons, not spinners or blank pages.
- No visible layout shift on the feed or a post page.
- Escape and backdrop clicks close every modal, and focus is handled.
- Every screen works at 390px, with bottom navigation on mobile.
- The full invite flow completes on a real phone from a real text message.
- `npx tsc --noEmit` and `npm run build` pass. No new lint errors.
- `master` untouched.

## Workflow

Continue on `feat/social-v1`. **No merge and no PR without explicit sign-off.** Small commits.

Show the visual diff before starting work on it.

## After this

There is no phase five build. The next thing after this is a launch plan, not a brief.
