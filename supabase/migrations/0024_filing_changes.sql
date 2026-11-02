-- Phase nine, stage 7 — what changed in the risk factors. See
-- docs/phase-nine.md, Stage 7.
--
-- PASTED 2 November 2026.
--
-- Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one.
--
-- NEW OBJECTS ONLY. Nothing here alters, drops, or touches an existing table.
-- Safe to paste twice: everything is `if not exists` / `drop policy if exists`.
--
-- Until this is pasted, the Filings tab lists the filings and says the
-- risk-factor comparison isn't available yet; nothing else changes.

-- ============================================================
-- filing_changes — one row per 10-K compared with the one before it.
--
-- Item 1A (risk factors) of the newer 10-K, compared paragraph by paragraph
-- with the older one, by rules (lib/sec/riskFactors.ts): what was added,
-- removed, changed and reworded, in the company's own words. Worked out once
-- per filing, after a page has been sent, and kept: a filed 10-K never
-- changes, so neither does the comparison.
--
-- accession is the newer 10-K's; prior_accession the one it was compared
-- with. status 'unavailable' records that there was nothing to compare (no
-- earlier 10-K, or no risk factors section, which smaller companies may
-- leave out), so the documents aren't downloaded again on every visit; the
-- reason is in result. A failed download records nothing and is tried again.
-- ============================================================
create table if not exists public.filing_changes (
  accession        text primary key,
  cik              text not null,
  prior_accession  text,
  status           text not null check (status in ('ok', 'unavailable')),
  result           jsonb,
  computed_at      timestamptz not null default now()
);

create index if not exists filing_changes_cik_idx
  on public.filing_changes (cik, computed_at desc);

-- Public read, service-role write, the same shape as the other research
-- tables. The policy doesn't query its own table, so it can't recurse
-- (gotcha 5).
alter table public.filing_changes enable row level security;

drop policy if exists "filing_changes are public" on public.filing_changes;
create policy "filing_changes are public"
  on public.filing_changes
  for select
  using (true);
