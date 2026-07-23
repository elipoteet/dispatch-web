import { createClient } from "@supabase/supabase-js";

// Bypasses Row Level Security entirely — used only for the two server-side
// writes to `subscriptions` that a user's own RLS-bound client can't make
// (that table intentionally has no insert/update policy for users; see
// supabase/migrations/0001_subscriptions.sql). Both call sites derive every
// value from either the authenticated session or Stripe's own webhook
// payload — never from arbitrary client input — so bypassing RLS here
// doesn't reopen the "client can't forge subscription state" guarantee.
// Never import this from a client component.
export function createServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
