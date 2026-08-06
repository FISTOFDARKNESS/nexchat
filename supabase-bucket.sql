-- Run in Supabase SQL Editor.
-- Creates the public "marketplace" bucket used by NexChat media uploads.

insert into storage.buckets (id, name, public)
values ('marketplace', 'marketplace', true)
on conflict (id) do nothing;

create policy "marketplace insert anon" on storage.objects
for insert to anon with check (bucket_id = 'marketplace');

create policy "marketplace select anon" on storage.objects
for select to anon using (bucket_id = 'marketplace');

create policy "marketplace delete anon" on storage.objects
for delete to anon using (bucket_id = 'marketplace');
