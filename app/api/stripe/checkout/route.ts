import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Finds this user's Stripe customer id, creating one (and persisting it)
// if they've never started a checkout before. Kept outside the handler so
// the "look up, else create + upsert" logic reads as one step.
//
// The lookup uses the caller's own RLS-bound client (fine — a user can
// select their own row). The write needs the service-role client instead:
// `subscriptions` intentionally has no insert/update policy for users (see
// the migration), so an RLS-bound upsert would silently no-op here. This
// route derives both values itself (userId from the session, customer.id
// from Stripe's own response) rather than trusting client input, so this
// narrow write doesn't reopen "the client can't forge subscription state".
async function findOrCreateCustomerId(
  supabase: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  // Upsert rather than insert — a row may already exist with a null
  // customer id (e.g. left over from an earlier attempt that didn't
  // complete), and this must not error in that case.
  await createServiceRoleClient()
    .from("subscriptions")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });

  return customer.id;
}

export async function POST() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || !process.env.STRIPE_PRICE_ID) {
    return NextResponse.json({ error: "Subscriptions are not configured yet." }, { status: 500 });
  }

  const customerId = await findOrCreateCustomerId(supabase, user.id, user.email);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    customer: customerId,
    subscription_data: { trial_period_days: 7 },
    // Card required up front (the default — no payment_method_collection
    // override). For a card-less trial instead, add:
    //   payment_method_collection: "if_required",
    success_url: `${siteUrl}/pricing?checkout=success`,
    cancel_url: `${siteUrl}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
    client_reference_id: user.id,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
