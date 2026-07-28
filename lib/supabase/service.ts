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
