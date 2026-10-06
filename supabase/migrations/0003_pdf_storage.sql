-- PDFs in the cloud (phase 8): the bytes of a chart live in Storage, one object per PDF, at `<band id>/<attachment id>`.
-- The description of each PDF (song, instrument, name…) is an ordinary `attachment` record, so it syncs like the rest.
--
-- Same rules as the data: every member can read; only the creator and editors can add, replace or delete; viewers cannot.
-- The bucket is private (nothing is reachable without a signed-in member), 25 MB per file, PDF only.

alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('performer', 'tuning', 'instrument', 'part', 'attachment', 'song', 'setlist', 'block', 'item'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

-- The band an object path belongs to (null when the first folder is not a band id).
create function public.band_of_path(p_name text) returns uuid
  language plpgsql immutable set search_path = public as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'pdfs' and public.is_member(public.band_of_path(name)));
create policy pdfs_add on storage.objects for insert to authenticated
  with check (bucket_id = 'pdfs' and public.member_role(public.band_of_path(name)) in ('creator', 'editor'));
create policy pdfs_replace on storage.objects for update to authenticated
  using (bucket_id = 'pdfs' and public.member_role(public.band_of_path(name)) in ('creator', 'editor'))
  with check (bucket_id = 'pdfs' and public.member_role(public.band_of_path(name)) in ('creator', 'editor'));
create policy pdfs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pdfs' and public.member_role(public.band_of_path(name)) in ('creator', 'editor'));

revoke all on function public.band_of_path(text) from public, anon;
grant execute on function public.band_of_path(text) to authenticated;
