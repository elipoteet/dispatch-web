# Phase Six — The Landing Page and Verified Roles

Branch `feat/social-v1`. Read `docs/product-spec.md` (v2), `docs/state-of-play.md`,
`docs/claude-project-context.md` and `docs/feedback-log.md` first. Phase five (research
inside the site) should land before or alongside this.

Both items in this phase came out of a mentor conversation logged in `docs/feedback-log.md`.
Eli made both calls explicitly.

---

## A. The landing page

### The decision

A stranger who is not signed in and lands on **the site root** sees a sign-in screen instead
of the feed. Signing in, or already being signed in, gives the feed exactly as it does today.

### The design

**A sign-in screen, not a marketing page.** One viewport, no scrolling, no sections. Logo
mark, the name, one sentence, a school-email field, a button. That is the whole page.

This is deliberate, and it corrects a first draft that had a hero, a feature grid, a diagram
and six selling points. The Dispatch is heading toward being an app, and app front doors look
like Instagram's or Bluesky's — they identify the product and get out of the way. Anyone
arriving here was sent by a person, not by an ad, so the page does not need to sell.

The published reference is the spec. Navy `#0E1D33` full-bleed, cream `#F0EBE0` text, gold
`#B08430` on the single button, zero radius, Inter for the sentence and IBM Plex Mono for the
wordmark and label. Centred column, roughly 352px wide. It should look right on a phone
without needing a media query, because it is already phone-shaped.

Copy, exactly:

- Wordmark: **The Dispatch**
- Description: *Where college students argue about markets, under their real name and school.*
- Field label: **School email**, placeholder `you@unh.edu`
- Button: **Continue**
- Below the button: *We'll send you a code. No password, and your email is never shown to anyone.*
- Footer: *Not investment advice*

The email field is not decoration. It should feed the existing `/api/auth/request-code` flow
directly, so a student types their address once and lands on the code step — not on `/signup`
to type it a second time.

### The part that will break things if you get it wrong

**"Signed out sees the pitch" must apply to the site root only — never as a blanket redirect.**

The invite flow depends on it. A club officer texts a `/j/[token]` link to fourteen people;
every one of them opens it signed out. A global "signed out → landing page" rule silently
destroys the single most important path in the product, and it will look like the invite
links are broken rather than like a routing rule is too broad.

Every one of these must still resolve for a signed-out visitor, exactly as it does today:

- `/j/[token]` — invite links
- `/p/[id]` — a single post
- `/u/[handle]` and `/@handle` — profiles
- `/s/[slug]` — a space (which still refuses non-members, as now)
- `/research` and `/research/[ticker]` — after phase five
- `/signup`, `/login`, `/onboarding`, `/disclaimer`, `/guidelines`

Only `/` changes. Implement it in the feed page component's own render — signed out renders
the landing page, signed in renders the feed — rather than in `proxy.ts`. Middleware-level
redirects are exactly how this becomes a blanket rule by accident.

### Also

- The landing page must be indexable — `robots: { index: true }` on this page specifically,
  even though the rest of the branch is noindexed. It is the page a club officer will Google.
- Keep the existing orientation strip on the signed-in feed. It solves a different problem
  (round-one feedback: a returning user misreading the product as a trading app), and it is
  now the only place the product explains itself at any length.
- **Accept that this page tells a stranger very little.** That is the trade made by replacing
  the feed for signed-out visitors. If it turns out to cost sign-ups once a real club is on
  the site, the fix is to open one public post or the ticker pages as a shop window — not to
  grow this page back into a brochure.

---

## B. Verified roles

### The decision

Four identities, not two: **Student, Alumni, Faculty, Mentor.** Eli chose to build this now.

### The problem to solve first

The existing verification model cannot express this on its own, for two concrete reasons:

1. **A professor and a student have the same email domain.** `@unh.edu` proves the school and
   nothing else. Domain gating cannot tell faculty from a freshman, so faculty verification
   cannot be automatic.
2. **An outside mentor has no school email at all.** They cannot come through the existing
   door in any form.

So the architecture is:

- **Student and Alumni stay fully automatic**, exactly as today — school email, grad year,
  past year means alum. Nothing about the current signup flow changes.
- **Faculty and Mentor are granted, never self-selected.** No public application form, no
  checkbox at signup. Eli (or a space owner, if he decides to delegate later) grants the role
  to an existing account. A mentor still signs up normally first with whatever email they
  have; the role is applied afterward.

This keeps the automatic path untouched, means there is no new abuse surface at signup, and
matches how the badge is meant to read: an automatic badge says *this domain checked out*, a
granted badge says *someone vouched for this person*.

### Data model

`0013_roles.sql`. Additive only — new column, no changes to existing ones.

- Add `profiles.role` — an enum or checked text column of `student | alumni | faculty | mentor`,
  defaulting to `student`.
- Alumni is currently **derived** from `grad_year < current year`. Do not break that. Either
  keep deriving it and let `role` hold only `student | faculty | mentor`, or backfill it and
  derive nothing — pick one and write down which, because two sources of truth for "is this
  person an alum" is a bug waiting to happen. State the choice in the recap.
- `faculty` and `mentor` need somewhere to put an affiliation string — a department for
  faculty, a firm or role for a mentor — since a mentor has no school and no class year, and
  the badge needs something to say.
- RLS: `role` is readable by anyone (it renders on every post) and writable by **nobody**
  through the normal client path. Grant it by service-role query or a `security definer`
  function only. A user must never be able to set their own role. Confirm this with an actual
  attempt from a signed-in client, not by reading the policy.
- Remember the house convention: write the migration file, explain it plainly, and let Eli
  paste it into the Supabase SQL editor. Do not run DDL against the live database.

### The badge

**A rosette check — one shape, four colours.** Twelve lobes, a single SVG path, a check
inside. The shape never changes between tiers, so the mark always reads as "verified" at a
glance; the colour is what says which kind of person you are reading. A published reference
page shows all four in a feed row, at every size, with the markup.

| Role | Colour (light) | Colour (dark) |
|---|---|---|
| Student | `#3E76B8` blue | `#5A93D4` |
| Alum | `#9A9384` warm grey | `#8F8A7C` |
| Faculty | `#0E1D33` navy | `#B8C6DA` |
| Mentor | `#B08430` gold | `#D2A44E` |

Why these four: the blue is a lighter relative of the brand navy, the grey is warm so it sits
with the cream rather than fighting it, and gold is the brand accent held back for the rarest
tier. **No green and no red** — on a site covered in price data those already mean up and
down, and a green check next to a name on a post about a stock is genuinely ambiguous.

Faculty is the one that needs care: navy is near-black on cream and reads as institutional,
but it disappears entirely on a dark ground, so it flips to a pale slate in dark mode. Drive
all four from custom properties (`--v-student`, `--v-alum`, `--v-faculty`, `--v-mentor`) that
redefine under both `[data-theme="dark"]` and `prefers-color-scheme`, following the existing
pattern in `globals.css`.

The path, viewBox `0 0 16 16`:

```
M8 0.85A1.85 1.85 0 0 1 11.57 1.81A1.85 1.85 0 0 1 14.19 4.42A1.85 1.85 0 0 1 15.15 8
A1.85 1.85 0 0 1 14.19 11.57A1.85 1.85 0 0 1 11.57 14.19A1.85 1.85 0 0 1 8 15.15
A1.85 1.85 0 0 1 4.43 14.19A1.85 1.85 0 0 1 1.81 11.58A1.85 1.85 0 0 1 0.85 8
A1.85 1.85 0 0 1 1.81 4.42A1.85 1.85 0 0 1 4.42 1.81A1.85 1.85 0 0 1 8 0.85Z
```

Check: `M4.6 8.2l2.3 2.3 4.5-4.6`, stroked at 2.2 in the surface colour, round caps and joins.

Rules for using it:

- **One component, used everywhere a name appears** — feed, post page, replies, profiles,
  space member lists, the digest email, the landing page. Same lesson as the "from a space"
  kicker: if each surface has to remember to render it, two of them will forget.
- **15px beside a name in a feed row, 13px is the floor.** Below 13 the lobes turn to mush and
  the check loses its corners. If something needs smaller, use a plain filled circle in the
  same colour rather than shrinking this.
- **Always give it a real `aria-label`** ("Verified student", "Verified mentor"). The badge
  carries meaning, so it is not decorative.
- The badge shows the tier. The **school and class year stay as text beside it**, as they are
  today — the rosette replaces the old outlined chip's checkmark, not the `UNH '28` label.
- Email is the one place to be careful: use a PNG fallback or inline the path, since some
  clients drop `<use href>` references.

### Things that follow from this and are easy to miss

- **A mentor has no school.** Every place that assumes `school.short_name` and `grad_year`
  exist will need a null path — the badge, the profile header, the member list, the avatar
  fallback, and the digest email.
- **School-colour tinting** currently keys off the school. Mentors have none; decide what they
  get and make it deliberate.
- **Faculty and mentors in Spaces.** A space owner inviting a mentor is the whole point of the
  role. Confirm nothing in the invite or membership logic assumes a school match.
- **Search and profile URLs** — the two handle systems already noted in `state-of-play.md` are
  now more likely to collide. Worth resolving in this phase rather than later.

### One design note, not a decision to relitigate

A professor pushing back on a student's post is not the same social act as a peer doing it,
particularly if that professor grades that student. Eli decided the role ships; the thing to
get right in the build is that the role is **visible**, so the reader can weigh it, and that
faculty get no extra powers — no moderation rights, no pinning, no elevated visibility. A
faculty badge should say who someone is, not give them authority over the thread.

---

## Before you call it done

1. `npx tsc --noEmit` and `npm run build` clean; no new lint errors.
2. Real `next start`, then `curl`. Documented Next behaviour has repeatedly not matched actual
   behaviour in this version.
3. **In an incognito window**, walk a real invite link end to end — paste a `/j/[token]` URL
   while signed out and confirm it opens the join flow and not the landing page. This is the
   single highest-risk regression in this phase.
4. Also incognito: `/`, one `/p/[id]`, one `/@handle`, one `/research/[ticker]`. Only the root
   should show the sign-in screen.
5. Type a school email into the landing page field and confirm it lands on the code step,
   without a second screen asking for the same address.
6. The landing page is one viewport with no scrollbar, at 390x844 and at 1440x900.
7. Confirm a signed-in user cannot change their own `role` from the client.
8. Render all four badges on a real post and a real profile, in light and dark.
9. Confirm a mentor account with no school and no grad year renders everywhere without a
   crash or an empty badge.

Report in plain language: what a stranger now sees, what a mentor now sees, and anything this
brief got wrong.
