# Phase Three Build Brief — Spaces and Promotion

August 2026. Follows `docs/phase-two.md` and the pre-launch polish work.

**Read `docs/product-spec.md` first, and note that it was rewritten to v2.** Phase three is
no longer ticker research pages and thesis-tested events. Those moved to the deferred list.
Phase three is Spaces and promotion, which is the last piece of the pipeline that does not
exist.

Visual reference for all of this: **`docs/prototype-v2.html` in this repo.** Open it in a
browser. It has the space page, the invite panel, and the promotion modal working end to end.
Match its structure and behaviour, not its literal markup.

Ignore any older prototype found elsewhere on the machine. Anything showing a "Wire" feed
with Watchlists and Themes tabs is the v1 prototype and matches the superseded v1 spec.

## What phase three is

**A Space is a private room for a club. Promotion is how something in that room becomes
public.**

That pair is the product. Spaces without a public layer is a worse Discord. A public feed
without Spaces is a worse Twitter. The passage between them is the thing nobody else has.

## Data model

New migration `0011_spaces.sql`, hand-written, applied by hand in the Supabase SQL editor.

**`spaces`**
- `id` uuid primary key
- `slug` text unique, lowercase, url-safe
- `name` text
- `description` text nullable
- `owner_id` uuid references `profiles(id)`
- `school_id` uuid references `schools(id)` nullable
- `invite_token` text unique, random, at least 16 url-safe characters
- `created_at`, `deleted_at` timestamptz nullable

**`space_members`**
- `space_id` uuid references `spaces(id)` on delete cascade
- `profile_id` uuid references `profiles(id)` on delete cascade
- `role` text, checked against `owner`, `member`
- `joined_at` timestamptz
- primary key on (`space_id`, `profile_id`)

**`posts`** gains:
- `space_id` uuid references `spaces(id)` nullable. **Null means the public feed.** This is
  the single most important column in the schema now.
- `promoted_from` uuid references `posts(id)` nullable, set only on the public copy.

Whether a space post has been published is derived by checking for a public post whose
`promoted_from` points at it. Do not denormalise this onto the space post; one source of
truth avoids the two drifting.

### Row level security, which is the security-critical part

Get this wrong and private club discussion leaks publicly. Test it, do not reason about it.

- A post with `space_id` null stays readable by everyone including signed-out visitors, as
  today.
- A post with `space_id` set is readable **only** if `auth.uid()` is a member of that space.
- Inserting a post with a `space_id` requires membership of that space.
- **Replies inherit the visibility of their parent post.** This is a nested check and it is
  the most likely place for a leak, because a reply row does not itself carry a `space_id`.
  Either add one and keep it in sync, or write the policy as a subquery against the parent.
  Whichever you choose, prove it.

Verification, empirically rather than by reading policy text: sign in as a non-member and
attempt to read a space post and its replies directly through the REST endpoint. Both must
come back empty. Do the same signed out.

## Spaces

### Creating one

Any verified member can create a space. Name, optional description, and that is it. The
creator becomes the owner and the first member. Generate the slug from the name, and the
invite token randomly.

### Joining

**Invite links, and nothing else.** No directory, no search, no discovery, no join requests.
The owner copies a link and drops it into the club's existing group chat.

Route: `/j/[token]`.

- Signed in and verified: add them to `space_members`, redirect to the space.
- Already a member: redirect to the space, no error.
- Signed out: store the token, send them through the existing signup flow, and **join them
  to the space automatically once verification and onboarding complete.** This flow matters.
  Someone taps a link in a group chat, has no account, and must land inside the space rather
  than on a generic feed wondering what happened.
- Invalid or revoked token: a plain page saying the link is no longer valid.

A verified school email is still required. The link gets you through the door; the badge
system still says who you are.

### Owner controls

Rename, edit the description, regenerate the invite link, remove a member, delete the space,
and **transfer ownership**.

Ownership transfer is not optional. Club officers graduate every year, and if ownership
cannot move, every space dies with whoever created it. That is the same churn problem the
alumni badge exists to solve.

Deleting a space is a soft delete. Set `deleted_at`, hide it everywhere, leave the rows.

### The space page

Header carries the name, description, a private indicator, member avatars and count, and the
owner badge when applicable. The invite panel appears only for the owner, showing the link
with copy and regenerate actions, plus one line explaining that anyone with a verified school
email who opens the link joins.

Below that, the composer, then the posts, newest first.

### Posting inside a space

**No post types. No length floor. No scaffold. No change-my-mind field. No position
disclosure.**

A working room should not make someone choose a genre before they write. The composer inside
a space is a text box plus ticker attachment, and nothing else.

Ticker attachment still works exactly as it does publicly, including the debounce, the single
fetch per draft, and the frozen snapshot. That is the main reason a club would rather be here
than in a group chat.

Replies and pushback work as they do today.

## Promotion

The author of a space post, and only the author, can publish it to the public feed.

### The flow

A "Publish to the feed" action on their own space posts opens a confirmation step that says
plainly what is about to happen: this becomes public under your name and school, it stays in
the space, and the replies here do not travel with it.

Then it collects the three things that only matter once something is public:

- **Post type.** Take, Question, Thesis, or Link.
- **What would change your mind.** Optional, shown only when a ticker is attached.
- **Position disclosure.** Required when a ticker is attached, own it or no position.
  Publish stays disabled until answered.

This is deliberate. Structure gets chosen at the moment a working note becomes a public
claim, not while someone is still thinking.

### What it does

Creates a **new** public post, copying the body, ticker, ticker snapshot, and any themes, and
setting `promoted_from` to the space post's id. The space post is untouched apart from now
having a published counterpart.

The space post shows a marker saying it was published, linking to the public version. The
public post shows a small marker that it came from a space.

**Do not name the space on the public post.** Spaces are private and the name of a club is
information the space owner has not agreed to publish. See the open questions.

Promotion is one-way and one-time. If a post is already published, show the marker rather
than the action.

## Navigation

The left nav becomes Feed, Research, then a Spaces section listing the spaces the user
belongs to, then a new-space action.

Each space in the nav shows a small count of posts since the user last opened it. That count
is the only nudge in the product and it should stay quiet.

## Explicitly not in scope

Real-time delivery, websockets, typing indicators, read receipts, or unread badges beyond the
simple count. Direct messages. Channels or sub-rooms inside a space. Reactions. A space
directory, search, or any public spaces. Join requests or approval flows. Cross-school
spaces. Ticker research pages, clickable cashtags, thesis-tested events, themes, watchlists,
and network aggregates, all of which are deferred in the spec.

This is a finance workspace that happens to have conversation in it. It is not Discord with
tickers, and every item on that list is a step toward becoming Discord with tickers.

## Done means

- A verified member can create a space and is its owner and first member.
- The owner sees an invite link; a member does not.
- Opening the invite link while signed in joins the space and lands on it.
- Opening it while signed out runs signup, then lands the new user **inside the space**.
- Regenerating the link makes the old one stop working immediately.
- Ownership can be transferred and the old owner becomes a normal member.
- Posting inside a space works, with ticker attachment and no types.
- **A non-member cannot read space posts or their replies, verified by querying the API
  directly as a non-member and signed out.**
- The author can promote their own post; nobody else can promote it.
- Promotion creates a public copy, leaves replies behind, and marks both sides.
- A ticker post cannot be promoted without a position stated.
- The nav lists the user's spaces with a quiet count.
- `npx tsc --noEmit` and `npm run build` pass. No new lint errors.
- `master` untouched, existing routes unchanged.

## Before starting

Confirm `0009_school_colors.sql` and `0010_avatars.sql` are actually applied in Supabase.
They were handed over last session and not confirmed. Avatars and school colours do nothing
until they are, and avatars appear on the space page.

## Workflow

Continue on `feat/social-v1`. **No merge and no PR without explicit sign-off.** Small commits.
Clean up scratch files and kill background servers before finishing.

## Open questions to raise rather than decide

Whether a promoted post should name the space it came from. A club may want the credit, and
the space owner may not want the club's existence public. Currently specified as not naming
it.

Whether spaces can ever span schools, or stay within one campus.
