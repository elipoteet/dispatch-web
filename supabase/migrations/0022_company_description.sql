-- Phase nine, stage 2 — the Overview's two-sentence description. See
-- docs/phase-nine.md, Stage 2.
-- Written to be run by hand in the Supabase SQL editor, same as every migration
-- before this one.
--
-- NEW OBJECTS ONLY. Nothing here alters, drops, or touches an existing table.
-- Safe to paste twice: everything is `if not exists` / `drop policy if exists`.
--
-- Until this is pasted, company pages render without the description and the
-- site makes no Claude calls for it: the code checks that this table exists
-- before generating anything.

-- ============================================================
-- company_description — one row per company.
--
-- The company's own 10-K Item 1 ("Business"), summarised once by Claude into two
-- plain sentences. It is the only AI-written line on the Overview, and the page
-- labels it as such.
--
-- Generated after the page has been sent, never while a visitor waits, and only
-- again when a newer 10-K is filed: source_accession records which annual
-- report the text came from, so a new one is noticed by comparison.
--
-- status 'unavailable' records that Item 1 could not be read reliably from that
-- filing (or Claude declined), so the same filing is not downloaded and tried
-- again on every visit. The next 10-K gets a fresh attempt.
-- ============================================================
create table if not exists public.company_description (
  cik               text primary key references public.sec_company (cik) on delete cascade,
  status            text not null default 'ok' check (status in ('ok', 'unavailable')),
  -- Empty when status is 'unavailable'.
  description       text not null default '',
  source_accession  text not null,
  source_form       text not null,
  model             text,
  generated_at      timestamptz not null default now()
);

-- Public read, service-role write, the same shape as sec_company and
-- sec_financials in 0021. No insert/update policy: only the server writes,
-- with the service-role key, which bypasses row-level security. The policy
-- does not query its own table, so it cannot recurse (gotcha 5).
alter table public.company_description enable row level security;

drop policy if exists "company_description is public" on public.company_description;
create policy "company_description is public"
  on public.company_description
  for select
  using (true);
