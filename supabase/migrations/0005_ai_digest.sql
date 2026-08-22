-- AI daily digest — extends the alert bell. See dispatch-ai-digest-plan.md.
-- No new table: reuses alert_event with a new `type` value ('ai_digest')
-- alongside the existing 'score_change' / 'rsi' / 'ma_cross'. Written to
-- be run by hand in the Supabase SQL editor, same as 0001-0004 — this
-- repo doesn't use the Supabase CLI's migration runner. Not destructive:
-- drop-then-recreate is idempotent, safe to re-run.

-- The shared general-market note is stored as one row per day using this
-- reserved ticker value, which can never collide with a real stock symbol
-- (uppercase-only tickers are enforced everywhere else in this app).
-- Every signed-in visitor should be able to read it regardless of their
-- own watchlist, so the existing "must be watching this ticker" policy
-- gets an `or` clause for it.
drop policy if exists "alert_event_select_watched" on public.alert_event;
create policy "alert_event_select_watched"
  on public.alert_event
  for select
  using (
    ticker = '__market__'
    or exists (
      select 1 from public.watchlist w
      where w.user_id = auth.uid() and w.ticker = alert_event.ticker
    )
  );
-- No insert/update/delete policy — only the cron job's service-role
-- client ever writes ai_digest rows, same as every other alert_event row.
