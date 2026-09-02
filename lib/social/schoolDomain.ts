// A school can genuinely have more than one working email domain — real
// for UNH specifically: it's part of the University System of New
// Hampshire, and students/staff commonly have both a campus address
// (unh.edu) and a system-wide one (usnh.edu) that both actually work.
// schools.domain (supabase/migrations/0006_social.sql) is a single
// `unique` column — one canonical row per school, seeded as 'unh.edu' —
// so rather than a schema change (a domains array or a join table) for
// what's currently one known alias, this is a small hand-maintained map
// checked before every schools lookup, same posture as
// lib/social/handle.ts's RESERVED_HANDLES: needs occasional attention if
// another school turns out to have the same multi-domain situation, but
// no migration required for this one.
const SCHOOL_DOMAIN_ALIASES: Record<string, string> = {
  "usnh.edu": "unh.edu", // University System of New Hampshire
};

export function canonicalSchoolDomain(domain: string): string {
  return SCHOOL_DOMAIN_ALIASES[domain] ?? domain;
}
