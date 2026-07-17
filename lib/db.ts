// Postgres access for route handlers, via Supabase's PostgREST layer rather
// than a raw `pg` connection — we already have a session-aware client
// (@supabase/ssr) from the auth work in Phase 1, and Postgres Row Level
// Security (see the `watchlist` table's policies) enforces per-user
// isolation regardless of which client talks to it.
//
// This just re-exports the request-scoped server client under the name the
// architecture doc's folder structure expects; callers still get RLS scoped
// to whichever user's cookies are on the request.
export { createClient as getDb } from "./supabase/server";
