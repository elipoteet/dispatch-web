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

// Plain anon-key client with no cookie/session plumbing — used for reading
// the Monthly Leaderboard's public views (public_leaderboard,
// public_month_status, public_handles — see
// supabase/migrations/0003_leaderboard.sql), which are grant-selected to
// anon and carry no per-user data. Session-independent on purpose: unlike
// the cookie-scoped client in lib/supabase/server.ts, this is safe to call
// from inside unstable_cache (lib/competition/publicBoard.ts), which caches
// across requests and can't depend on one request's cookies.
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
