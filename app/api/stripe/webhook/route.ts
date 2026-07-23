import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Db = ReturnType<typeof createServiceRoleClient>;

// The checkout route always upserts { user_id, stripe_customer_id } before
// redirecting to Stripe, so by the time any subscription webhook fires for
// a real checkout, that mapping already exists in our own table — no extra
// Stripe API call needed for the common case. Falls back to the Stripe
// customer's own metadata (set at customer-creation time) for edge cases,
// e.g. a synthetic event fired via `stripe trigger` that never went
// through our checkout route.
async function resolveUserId(db: Db, customerId: string): Promise<string | null> {
  const { data } = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (data?.user_id) return data.user_id;

  const customer = await getStripe().customers.retrieve(customerId);
  if (customer.deleted) return null;
  return (customer.metadata?.supabase_user_id as string | undefined) ?? null;
}

async function upsertFromSubscription(db: Db, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(db, customerId);
  if (!userId) {
    console.error(`[stripe webhook] Could not resolve a user for customer ${customerId} — skipping.`);
    return;
  }

  // current_period_end lives on the subscription *item*, not the
  // subscription itself, as of this pinned API version — verified against
  // the installed SDK's types rather than assumed. Single-price plan, so
  // items.data[0] is always the one that matters.
  const item = sub.items.data[0];

  const { error } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: item?.price?.id ?? null,
      current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("[stripe webhook] subscriptions upsert failed:", error.message);
}

export async function POST(request: Request) {
  // Signature verification needs the exact raw bytes Stripe signed — read
  // as text, never JSON.parse first (that would re-serialize and break the
  // signature match).
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Upserts throughout (never plain inserts) — Stripe retries webhook
  // deliveries and can send the same event more than once, so every
  // handler here must be safe to run twice.
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      // Re-fetch the full subscription rather than trusting fields on the
      // session itself, so status/price/period end come from one
      // consistent, authoritative read.
      if (subscriptionId) {
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        await upsertFromSubscription(db, sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertFromSubscription(db, sub);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
