import Stripe from "stripe";

// Server-only — never import this from a client component. Lazily
// initialized rather than constructed at module load: a top-level `new
// Stripe(...)` throws immediately if STRIPE_SECRET_KEY is unset, which
// (confirmed the hard way) fails `next build` for the *entire app*, not
// just the Stripe routes, since Next evaluates route modules while
// collecting page data. Matches the check-at-call-time pattern already
// used in lib/providers.ts instead.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
    cached = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return cached;
}
