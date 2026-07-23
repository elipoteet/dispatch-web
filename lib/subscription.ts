import { getDb } from "@/lib/db";

type Db = Awaited<ReturnType<typeof getDb>>;

// TODO: promised-but-not-yet-built Subscriber features. Don't gate any of
// these until they actually exist — see app/pricing/page.tsx's feature
// list and the "Never block the core free memo" rule.
//   - Extended fundamentals & ratios beyond what the free memo shows.
//   - 20-year price history (free tier gets ~5 years today) — see the
//     GATED FEATURE comment on fetchPricesRaw in lib/providers.ts for why
//     this specifically isn't a quick add.
//   - Weekly written letter (needs an actual content/email pipeline).
//   - Earnings calendar alerts (needs a notification pipeline).
// Once any of these exist, gating is a one-line `if (!(await
// requireSubscriber(user.id)))` in the relevant route/component.

export type Subscription = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

// Reads a user's subscription row. Only server-side code holding the
// service-role key ever writes this table (the Stripe webhook, and the
// checkout route's "find or create Stripe customer" step) — the client has
// no path to forge it, so a row existing at all means Stripe said so.
export async function getSubscription(supabase: Db, userId: string): Promise<Subscription | null> {
  const { data } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

// Trial users get full access — 'trialing' counts the same as 'active'.
// Anything else (past_due, canceled, or no row at all) does not.
export function isSubscriber(sub: Subscription | null | undefined): boolean {
  return sub?.status === "active" || sub?.status === "trialing";
}

// One-line gate for route handlers: `if (!(await requireSubscriber(user.id))) { ... }`
export async function requireSubscriber(userId: string): Promise<boolean> {
  const supabase = await getDb();
  const sub = await getSubscription(supabase, userId);
  return isSubscriber(sub);
}
