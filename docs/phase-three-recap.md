# Phase Three Recap — for the Claude Project, ahead of Phase Four

Paste this into the Claude Project's knowledge alongside `product-spec.md` (now v2),
`phase-one.md`, `phase-one-recap.md`, `phase-two.md`, `phase-two-recap.md`,
`pre-launch-polish-recap.md`, `phase-three.md`, `alumni-verification.md`,
`legal-and-guidelines.md`, and `claude-project-context.md`, all of which live in this repo's
`docs/`. Covers Spaces and Promotion — "the last piece of the pipeline that does not exist,"
per `product-spec.md` v2 — end to end, live-tested, on `feat/social-v1`, pushed, **not
merged**. `master`/production untouched throughout.

## What shipped

**Spaces**: a private room for a club. Create one (name + optional description), you become
its owner and first member automatically. Invite by link only — no directory, no search, no
join requests — the owner copies `/j/[token]` and drops it wherever the club already talks.
A verified school email is still required to actually join; the link just gets you through
the door. Owner controls: rename, edit description, remove a member, regenerate the invite
link (old one stops working immediately), transfer ownership, delete the space (soft
delete). Posting inside a Space is deliberately bare — a text box plus `$TICKER` attachment
and nothing else, no types, no scaffold, no change-my-mind field, no position disclosure.
Replies and pushback work exactly as they do publicly.

**Promotion**: the author of a Space post, and only the author, can publish it to the public
feed. Opens a modal that quotes what was written, then collects the three things that only
matter once something is public — post type (Take/Question/Thesis, deliberately not Link —
see below), change-my-mind (optional, only if a ticker's attached), and position disclosure
(required if a ticker's attached, Publish stays disabled until answered). Creates a **new**
public post copying the body/ticker/snapshot; the Space post is untouched apart from now
showing a "Published to the feed →" marker linking to the copy. The public copy shows a
small repost-style kicker — icon + "FROM A SPACE," above the post header, not mixed into the
Reply/pushback action row — deliberately without naming the space (confirmed with you
directly: keeping this anonymous, matching the brief's own reasoning that a club's existence
isn't information its owner has agreed to publish, over building it to name the space).

**Left nav**: this surface's first — until now it was a single centered column under a plain
header. Feed, Research (links out to the untouched `/research` route group), then the user's
Spaces with a quiet per-space count of posts since they last opened it, then New Space.

**The invite link itself** resolves all four states a click can arrive in: signed in and
already onboarded (joins if not already a member, redirects straight to the space); signed
out (validates the token, then carries it through signup as `?invite=` — not a cookie, this
Next.js version can't set one from a plain page render — so it survives OTP verification into
onboarding and joins right after the profile is created, landing inside the space rather than
on `/`); signed in but mid-onboarding (same path, one step shorter); and invalid/revoked
(a plain "this link isn't valid anymore" page, never a silent failure or a confusing bounce).

## Real things found while building, and after — three of them live, not in review

- **The prototype the brief pointed at was stale.** `...\Claude\Artifacts\dispatch-social-prototype\index.html` turned out to be the superseded v1 prototype (Wire feed, Research/Watchlists/Themes — matching the old spec). The real v2 file, with the space page/invite panel/promote modal actually built out, was `dispatch-prototype-v2_3.html` in Downloads — flagged and paused on before building anything, rather than guessing from the wrong reference.
- **The prototype's own Space composer contradicts the brief's text.** It reuses the full public composer (type pills, scaffold, the works); `phase-three.md` is unusually emphatic that a Space composer should be "a text box plus ticker attachment, and nothing else." Read as the prototype cutting a corner for demo speed, not a reversal — built the minimal version the brief describes.
- **A genuine RLS infinite-recursion bug, caught from your first real click, not from review.** `space_members`'s own SELECT policy queried `space_members` from within a policy defined on `space_members` itself — Postgres error 42P17. `create_space()` (a security-definer function) never hit it, so creating a space looked like it worked; reading it back — the space page, the nav — failed immediately, which is why your first "New space" landed on a 404 despite the row existing correctly. Diagnosed with a temporary log rather than guessed at, fixed with the standard pattern (move the self-referencing check into a `security definer` helper function, which runs as its owner and bypasses the recursing policy), shipped as a follow-up migration.
- **The invite link pointed at production while testing locally, and that was correctly diagnosed as "expected" before it turned out to be worth fixing anyway.** `.env.local` deliberately pins `NEXT_PUBLIC_SITE_URL` to `dispatchresearch.com` — correct for reply-notification email links, which get opened from a phone regardless of where the code runs, but wrong for an invite link meant to be copied straight back into the same browser you're testing in. Fixed by deriving the link from the actual request's `host` header instead of the static env var, so it's `localhost:3000` locally and the real domain in production without any manual swapping.
- **The "from a space" marker went missing on the feed and profile pages**, not because it was never built but because the first version threaded it through each page's own `actions` prop, and two of three call sites never got updated to pass it. Fixed by moving the logic inside `PostCard` itself (derived straight from `post.promotedFrom`/`post.spaceId`), so it can't be forgotten by a future call site the way this one was.
- **First placement/styling of that marker read as another action link**, sitting directly under Reply in the same muted mono style — direct feedback after seeing it live. Moved to a small icon+label kicker above the post header with a trailing rule, the same "small label, then a line" shorthand Twitter/LinkedIn use for "this showed up here from somewhere else," rather than living among the action links at the bottom.

## Data model

`supabase/migrations/0011_spaces.sql` — `spaces` (slug, name, description, owner_id,
invite_token defaulting to a hyphen-stripped `gen_random_uuid()`, deleted_at) and
`space_members` (space_id, profile_id, role, joined_at, last_seen_at — that last column not
in the brief's literal list, added so the nav's quiet count is actually computable). `posts`
gains `space_id` (null = public feed) and `promoted_from`, plus a unique constraint on
`promoted_from` (promotion is one-time, enforced in the DB, not just a disabled button). Five
new `security definer` Postgres functions — a first for this repo, previously trigger-only —
`create_space`, `get_space_by_invite_token`, `join_space_via_token`,
`transfer_space_ownership`, `touch_space_last_seen`, each justified in the migration's own
comments (mostly: PostgREST can't do a multi-table atomic write, and a token-gated lookup for
non-members can't be expressed as an ordinary RLS policy without breaking either "no
directory" or the invite flow itself).

`supabase/migrations/0012_fix_space_rls_recursion.sql` — the recursion fix above. Adds
`is_space_member()`/`is_space_owner()` helper functions and moves every membership-check
subquery in 0011 (not just the recursive one) onto them, for one tested definition instead of
four copies of the same subquery.

Both applied to the live database and confirmed working — the recursion fix was verified
directly against the schema (checked the function existed before telling you to paste it a
second time), and the RLS itself was verified empirically after: a throwaway space/post/reply
set up via the service role, then read with the anon key (a true signed-out client) — the
post comes back empty, its replies come back empty, it never surfaces in a
`space_id is null`-filtered query (the same shape the public feed itself uses), and a
signed-out blind-insert attempt on the reply gets rejected outright. Torn down after.

## Known gaps / open items for whoever picks this up

- **No prototype/brief reference exists for Space creation or most owner controls** (rename,
  remove member, transfer, delete) — built from this app's own visual language since none
  existed to match. Worth a second look once it's had real use.
- **The left nav has no mobile treatment** — hidden below 900px, matching the reference
  prototype's own narrow-viewport choice, rather than a bottom tab bar. Feed/post/profile
  pages work fine without it; Spaces themselves are only reachable from the nav on a wide
  viewport for now.
- **Only one real Space has ever existed** (your test one, since deleted) — owner-controls
  UI (especially transfer ownership) is typechecked/built/linted but not clicked through with
  a second real member.
- **Whether a promoted post should ever name its Space is still open**, per your own
  confirmation this session — kept anonymous, matching `product-spec.md`'s own unresolved
  question, not decided shut.
- Everything still open from `docs/pre-launch-polish-recap.md` and `docs/phase-two-recap.md`
  (SPF, unsubscribe never clicked from a real email, digest never sent populated, two
  independent handle systems, the Monthly Leaderboard's fate) is **still open** — nothing in
  this phase touched any of it.
- **`docs/phase-four.md` doesn't exist yet.** No brief for what comes after Spaces and
  Promotion has been written — `product-spec.md` v2's own build order stops at "then: users.
  Ship it to one club, watch what happens, and let what they actually do decide the order of
  the deferred list," which reads like phase four might be more about real usage than new
  build, but that's not this document's call to make.

## Where to look for more

- `docs/product-spec.md` (v2) — full product vision, the deferred list, still-undecided
  questions.
- `docs/phase-three.md` — the brief this recap summarizes.
- `docs/phase-two-recap.md` and `docs/pre-launch-polish-recap.md` — everything before this.
- `docs/claude-project-context.md` — tech stack, brand rules, Next.js gotchas, and the "how
  to talk to Eli" plain-language note.
