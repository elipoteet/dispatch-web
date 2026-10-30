import { createClient } from "@supabase/supabase-js";

// Bypasses Row Level Security entirely — used by the alerts cron job
// (app/api/cron/alerts/route.ts) to read every user's watchlist and write
// ticker_snapshot/alert_event, none of which are scoped to one signed-in
// user the way a request-scoped client would require. Never import this
// from a client component.
export function createServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// Plain anon-key client with no cookie/session plumbing, for reading public,
// non-per-user data. Session-independent on purpose: unlike the cookie-scoped
// client in lib/supabase/server.ts, this is safe to call from inside
// unstable_cache, which caches across requests and can't depend on one
// request's cookies. Written for the Monthly Leaderboard's public views
// (removed 30 October 2026); kept for the research pages' public tables.
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
