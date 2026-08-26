// Mirrors the DB-level constraints in supabase/migrations/0006_social.sql
// (profiles_handle_format / profiles_handle_reserved) so the form can show
// a friendly message before ever hitting the database — the DB check is
// the real backstop, this is just for UX. Keep both in sync by hand.
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

// Deliberately short — a basic screen against impersonation-flavored
// handles, not a comprehensive filter, same spirit as the reserved list in
// app/api/competition/profile/route.ts (a separate, unrelated identity
// system — see 0006_social.sql's header comment).
export const RESERVED_HANDLES = new Set([
  "admin",
  "dispatch",
  "moderator",
  "support",
  "official",
  "help",
  // The Dispatch AI account (docs/phase-seven.md) — reserved, not
  // self-registerable, same as everything else in this list.
  "dispatchai",
]);

export function validateHandle(raw: string): string | null {
  const handle = raw.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    return "Handle must be 3-20 characters: lowercase letters, digits, and underscores only.";
  }
  if (RESERVED_HANDLES.has(handle)) {
    return "That handle is reserved. Pick another.";
  }
  return null;
}
