-- fix/price-credits (25 November 2026): one shared count of Twelve Data
-- credits per day, so the site can keep a reserve for the alerts job. Written
-- to be run by hand in the Supabase SQL editor, same as every migration
-- before this one.
--
-- WHY
--   Twelve Data's free plan allows 800 price requests a day, reset at
--   midnight UTC. On 24 November the site asked for 2,141 and the alerts job
--   got none. The site now stops fetching prices for visitors at 600 a day and
--   lets the alerts job go on to 790 (lib/prices/budget.ts). The site runs on
--   several server instances at once, so the count has to live in one place
--   they all see: one row per day here, claimed before each request.
--
-- WHAT THIS CHANGES
--   1. A new table, price_credit_day: one row per UTC day with three
--      numbers (requests for visitors, requests for the alerts job, and
--      whether Twelve Data has said it's out for the day). No ticker, no
--      user, nothing about who visited. Row-level security is on with no
--      policies, and the public and signed-in roles have no grants on it, so
--      only the server's service key can read or write it.
--   2. Two functions, callable only with the service key:
--        claim_price_credit(caller, visitor_cap, total_cap): counts one
--          request and answers true, or answers false without counting when
--          the cap for that caller is reached or the day is marked out.
--        mark_price_credits_out(): marks today out (Twelve Data said so).
--   Nothing else changes. No existing table, policy or grant is touched.
--
-- ROLLBACK
--   drop function if exists public.claim_price_credit(text, integer, integer);
--   drop function if exists public.mark_price_credits_out();
--   drop table if exists public.price_credit_day;
--   The site then counts per server instance again (less exact), and keeps
--   working.
--
-- Safe to paste twice: "if not exists" and "or replace" throughout.

create table if not exists public.price_credit_day (
  day date primary key,
  visitor integer not null default 0,
  alerts integer not null default 0,
  out_of_credits boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.price_credit_day enable row level security;
revoke all on table public.price_credit_day from anon, authenticated;
grant select, insert, update on table public.price_credit_day to service_role;

-- One credit for `p_caller` ('visitor' or 'alerts'), if there's room. The
-- update is a single statement on one row, so two instances claiming at the
-- same moment are counted one after the other, never both past a cap.
create or replace function public.claim_price_credit(p_caller text, p_visitor_cap integer, p_total_cap integer)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  d date := (now() at time zone 'utc')::date;
  claimed boolean;
begin
  if p_caller not in ('visitor', 'alerts') then
    raise exception 'claim_price_credit: unknown caller %', p_caller;
  end if;
  insert into public.price_credit_day (day) values (d) on conflict (day) do nothing;
  update public.price_credit_day
     set visitor = visitor + (case when p_caller = 'visitor' then 1 else 0 end),
         alerts = alerts + (case when p_caller = 'alerts' then 1 else 0 end),
         updated_at = now()
   where day = d
     and not out_of_credits
     and visitor + alerts < p_total_cap
     and (p_caller <> 'visitor' or visitor < p_visitor_cap)
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.mark_price_credits_out()
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.price_credit_day (day, out_of_credits)
  values ((now() at time zone 'utc')::date, true)
  on conflict (day) do update set out_of_credits = true, updated_at = now();
$$;

revoke all on function public.claim_price_credit(text, integer, integer) from public;
revoke all on function public.claim_price_credit(text, integer, integer) from anon, authenticated;
grant execute on function public.claim_price_credit(text, integer, integer) to service_role;

revoke all on function public.mark_price_credits_out() from public;
revoke all on function public.mark_price_credits_out() from anon, authenticated;
grant execute on function public.mark_price_credits_out() to service_role;
