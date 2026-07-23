-- Subscriptions table for the $7/month Stripe subscription.
-- Written to be run by hand in the Supabase SQL editor — this repo doesn't
-- use the Supabase CLI's migration runner, so nothing here executes
-- automatically. Not destructive: uses IF NOT EXISTS throughout so it's
-- safe to re-run.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,                       -- trialing | active | past_due | canceled | ...
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Users can read their own row and nothing else. No insert/update/delete
-- policy for the anon/authenticated roles at all — only server-side code
-- using the service-role key (which bypasses RLS entirely) ever writes
-- here: the Stripe webhook, and the checkout route's "find or create
-- Stripe customer" step. Both derive every written value from the
-- authenticated session or Stripe's own response, never from arbitrary
-- client input, so a signed-in user still has no path to forge their own
-- subscription status via the client.
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);
