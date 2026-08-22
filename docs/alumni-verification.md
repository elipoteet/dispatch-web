# Alumni Verification

August 2026. Supplements the identity section of `docs/product-spec.md`. Written as its own
note because the answer here changes how much needs building, and because it will need
updating every time a new school joins.

## The finding

UNH alumni keep their campus email address after graduation, for as long as the account
stays compliant with University System of New Hampshire policy. Full Microsoft 365 access
expires roughly thirty days into the semester after graduation, but the address itself
persists.

Source so far is a Google AI Overview citing USNH pages, which is suggestive rather than
confirmed. **Worth verifying properly before it becomes load-bearing**, either by asking
USNH IT directly or by having an actual recent grad try to receive a message at their old
address. This project already has a rule about checking things empirically rather than
trusting documentation, and it applies here more than most places.

## What it means if it holds

Alumni verify on the same path as students. A UNH grad enters their campus email, gets the
code, picks a past graduation year, and receives the same checkmarked badge with ALUM after
it. No separate flow, no separate trust tier, no OAuth.

That collapses most of the alumni problem into nothing. The account structure already
supported alumni; the only open question was how to trust them, and for UNH there is now no
question at all.

The LinkedIn path drops from a pillar to an edge case. It still needs to exist eventually,
because two groups fall outside the email path: alumni from schools that do not retain
addresses, and people whose account lapsed for non-compliance. Neither group is worth
building for in the first year.

The practical consequence for the build: the LinkedIn sign-in path can wait until a school
without retention actually joins.

## The thing this creates

Retention policy varies by school, which means it is now a per-school fact rather than a
platform-wide one. The database already maps email domain to school name for verification.
It should also carry a flag for whether that school retains alumni addresses.

That flag decides, per campus, whether alumni there can join at all before the LinkedIn path
exists. It is one column and it will save a confusing support conversation later.

## Known so far

| School | Alumni email retained | Confirmed how |
|---|---|---|
| University of New Hampshire | Yes, while compliant with USNH policy | AI summary of USNH pages, not yet verified directly |

Fill this in as schools are added. Check it before pitching a campus editor at a school
whose alumni you are counting on.

## What has not changed

The rule that an unchecked claim never looks like a checked one still stands, and it still
governs the LinkedIn path whenever that path gets built. Good news about UNH removes the
near-term need for the second tier; it does not remove the principle.
