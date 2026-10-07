-- Band management (phase 14): a band has notes, the creator can rename it and delete it, and the other members are told
-- when it is deleted. Run it once in the Supabase SQL editor, after 0001-0003.

alter table public.bands add column notes text not null default '' check (length(notes) <= 4000);

-- Creator only: change the name and the notes (the band's free text: where we rehearse, what to bring...).
create function public.update_band(p_band uuid, p_name text, p_notes text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(p_band) is distinct from 'creator' then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.bands set name = trim(p_name), notes = coalesce(p_notes, '') where id = p_band;
end $$;

-- What members are told while they are away. Kept after the band itself is gone, so a device that was offline still learns it.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('band_deleted')),
  band_id uuid not null,                     -- no foreign key: the band is exactly what disappears
  band_name text not null,
  by_email text not null,
  created_at timestamptz not null default now()
);
create index notices_user on public.notices (user_id, created_at);
alter table public.notices enable row level security;
create policy notices_select on public.notices for select to authenticated using (user_id = auth.uid());
revoke all on public.notices from anon, authenticated;
grant select on public.notices to authenticated;

create function public.dismiss_notice(p_id uuid) returns void
  language sql security definer set search_path = public as $$
  delete from public.notices where id = p_id and user_id = auth.uid()
$$;

-- Creator only. Tells every other member, then deletes the band with everything in it (members, invitations, all records:
-- songs, setlists...). Returns how many people were told. The app removes the PDF files from storage first.
create function public.delete_band(p_band uuid) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_by text;
  n integer;
begin
  if public.member_role(p_band) is distinct from 'creator' then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  select name into v_name from public.bands where id = p_band;
  select email into v_by from public.members where band_id = p_band and user_id = auth.uid();
  insert into public.notices (user_id, kind, band_id, band_name, by_email)
    select user_id, 'band_deleted', p_band, v_name, coalesce(v_by, '') from public.members where band_id = p_band and user_id <> auth.uid();
  get diagnostics n = row_count;
  delete from public.bands where id = p_band;
  return n;
end $$;

revoke all on function public.update_band(uuid, text, text), public.dismiss_notice(uuid), public.delete_band(uuid) from public, anon;
grant execute on function public.update_band(uuid, text, text), public.dismiss_notice(uuid), public.delete_band(uuid) to authenticated;
