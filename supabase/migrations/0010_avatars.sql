-- Profile pictures. Written to be run by hand in the Supabase SQL editor, same as every
-- migration before this one. Additive only: avatar_url is nullable, so every existing
-- profile keeps rendering its initials fallback until it sets one.

alter table public.profiles add column if not exists avatar_url text;

-- Storage bucket, public read (this is what makes the stored file reachable at a plain
-- public URL without needing a signed-URL round trip on every page render — every avatar
-- render is a public GET, no auth required, matching the rest of this app's "open to
-- read" posture).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Path convention is {user_id}/avatar.webp, overwritten in place on every change (never a
-- new filename) so old versions don't accumulate in the bucket. storage.foldername(name)
-- splits the object path into an array of segments — [1] is that leading {user_id}
-- folder, so these policies are the storage-schema equivalent of the auth.uid() = id
-- checks used everywhere else in this app; a user can only write inside their own folder.
drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects
  for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects
  for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects
  for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
