-- Instruments and parts (phase 7): two more kinds of record travel to the cloud, and each member can say which
-- instrument they play. The instrument itself is an ordinary record (in `records`), so `instrument_id` is a plain id
-- with no foreign key: the member row only remembers the choice, so it follows the person across devices.

alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('performer', 'tuning', 'instrument', 'part', 'song', 'setlist', 'block', 'item'));

alter table public.members add column instrument_id uuid;

-- Every member (viewers too: it is their own preference, not band data) sets only their own.
create function public.set_my_instrument(p_band uuid, p_instrument uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_band) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.members set instrument_id = p_instrument where band_id = p_band and user_id = auth.uid();
end $$;

create function public.my_instrument(p_band uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select instrument_id from public.members where band_id = p_band and user_id = auth.uid()
$$;

revoke all on function public.set_my_instrument(uuid, uuid), public.my_instrument(uuid) from public, anon;
grant execute on function public.set_my_instrument(uuid, uuid), public.my_instrument(uuid) to authenticated;
