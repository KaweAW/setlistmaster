-- Scaletta cloud schema (phase 6).
-- Run it once in the Supabase SQL editor (or `supabase db push`). It is tested against a real Postgres in
-- supabase/tests/cloud.test.ts.
--
-- Model: a band has members with a role (creator | editor | viewer). The creator is the band's founder: the only one
-- who can invite, change roles, remove people and revoke invitations. Editors change data, viewers only read.
-- Data lives in ONE generic table (`records`), one row per local record, so the app syncs every kind the same way.
-- All writes go through the functions below (security definer); tables only allow SELECT, and only to members.

create table public.bands (
  id uuid primary key,                       -- the same id the band has on the creator's device
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.members (
  band_id uuid not null references public.bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'editor', 'viewer')),
  email text not null,                       -- shown in the members list
  joined_at timestamptz not null default now(),
  primary key (band_id, user_id)
);
create unique index members_one_creator on public.members (band_id) where role = 'creator';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  email text,                                -- null = anyone with the link; otherwise only this address can accept
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create sequence public.records_seq;
create table public.records (
  band_id uuid not null references public.bands (id) on delete cascade,
  kind text not null check (kind in ('performer', 'tuning', 'song', 'setlist', 'block', 'item')),
  id uuid not null,
  data jsonb not null,                       -- the whole record, exactly as the app has it
  updated_at bigint not null,                -- client clock (ms): last write wins per record
  deleted_at bigint,                         -- soft delete, so deletions sync too
  updated_by uuid references auth.users (id),
  seq bigint not null default nextval('public.records_seq'),   -- server order, used by devices to ask "what's new?"
  primary key (band_id, kind, id)
);
create index records_band_seq on public.records (band_id, seq);

create function public.records_set_seq() returns trigger language plpgsql as $$
begin
  new.seq := nextval('public.records_seq');
  return new;
end $$;
create trigger records_seq before insert or update on public.records
  for each row execute function public.records_set_seq();

-- ---------------------------------------------------------------- who is who
create function public.member_role(p_band uuid) returns text
  language sql stable security definer set search_path = public as $$
  select role from public.members where band_id = p_band and user_id = auth.uid()
$$;

create function public.is_member(p_band uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where band_id = p_band and user_id = auth.uid())
$$;

-- ---------------------------------------------------------------- row level security: read-only, members only
alter table public.bands enable row level security;
alter table public.members enable row level security;
alter table public.invitations enable row level security;
alter table public.records enable row level security;

create policy bands_select on public.bands for select to authenticated using (public.is_member(id));
create policy members_select on public.members for select to authenticated using (public.is_member(band_id));
create policy invitations_select on public.invitations for select to authenticated
  using (public.member_role(band_id) = 'creator');
create policy records_select on public.records for select to authenticated using (public.is_member(band_id));

revoke all on public.bands, public.members, public.invitations, public.records from anon, authenticated;
grant select on public.bands, public.members, public.invitations, public.records to authenticated;

-- ---------------------------------------------------------------- actions
create function public.create_band(p_id uuid, p_name text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.bands (id, name, created_by) values (p_id, trim(p_name), v_uid);
  insert into public.members (band_id, user_id, role, email)
    values (p_id, v_uid, 'creator', lower(coalesce(auth.jwt() ->> 'email', '')));
  return p_id;
end $$;

-- Writes records; for each one the newest write wins (by updated_at). Editors and the creator only.
-- Returns how many records were actually applied.
create function public.upsert_records(p_band uuid, p_records jsonb) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.member_role(p_band);
  r jsonb;
  n integer := 0;
begin
  if v_role is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if v_role not in ('creator', 'editor') then raise exception 'read_only' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_records) loop
    if (r -> 'data' ->> 'bandId') is distinct from p_band::text then
      raise exception 'band_mismatch' using errcode = '22023';
    end if;
    insert into public.records (band_id, kind, id, data, updated_at, deleted_at, updated_by)
    values (p_band, r ->> 'kind', (r ->> 'id')::uuid, r -> 'data', (r ->> 'updated_at')::bigint,
            (r ->> 'deleted_at')::bigint, auth.uid())
    on conflict (band_id, kind, id) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
          updated_by = excluded.updated_by
      where public.records.updated_at < excluded.updated_at;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create function public.create_invitation(p_band uuid, p_role text, p_email text default null) returns text
  language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if public.member_role(p_band) is distinct from 'creator' then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  insert into public.invitations (band_id, role, email, created_by)
    values (p_band, p_role, nullif(lower(trim(p_email)), ''), auth.uid())
    returning token into v_token;
  return v_token;
end $$;

create function public.revoke_invitation(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.invitations set revoked_at = now()
    where id = p_id and revoked_at is null and accepted_at is null
      and public.member_role(band_id) = 'creator';
  if not found then raise exception 'creator_only' using errcode = '42501'; end if;
end $$;

-- What a link points to, shown before the person accepts. status: ok | expired | revoked | used | not_found
create function public.invitation_preview(p_token text)
  returns table (band_name text, role text, email_bound boolean, status text)
  language plpgsql stable security definer set search_path = public as $$
declare i public.invitations; b public.bands;
begin
  select * into i from public.invitations where token = p_token;
  if not found then
    return query select null::text, null::text, false, 'not_found'::text;
    return;
  end if;
  select * into b from public.bands where id = i.band_id;
  return query select b.name, i.role, i.email is not null,
    case when i.revoked_at is not null then 'revoked'
         when i.accepted_at is not null then 'used'
         when i.expires_at < now() then 'expired'
         else 'ok' end;
end $$;

-- One person per invitation. Joining twice is harmless (returns the band again).
create function public.accept_invitation(p_token text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  i public.invitations;
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into i from public.invitations where token = p_token for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.members where band_id = i.band_id and user_id = v_uid) then
    return i.band_id;
  end if;
  if i.revoked_at is not null then raise exception 'invitation_revoked' using errcode = '42501'; end if;
  if i.accepted_at is not null then raise exception 'invitation_used' using errcode = '42501'; end if;
  if i.expires_at < now() then raise exception 'invitation_expired' using errcode = '42501'; end if;
  if i.email is not null and i.email <> v_email then
    raise exception 'invitation_wrong_email' using errcode = '42501';
  end if;
  insert into public.members (band_id, user_id, role, email) values (i.band_id, v_uid, i.role, v_email);
  update public.invitations set accepted_by = v_uid, accepted_at = now() where id = i.id;
  return i.band_id;
end $$;

-- Creator only: change a member's role, or remove a member. The creator cannot be changed or removed.
create function public.set_member_role(p_band uuid, p_user uuid, p_role text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(p_band) is distinct from 'creator' then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  update public.members set role = p_role where band_id = p_band and user_id = p_user and role <> 'creator';
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
end $$;

create function public.remove_member(p_band uuid, p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(p_band) is distinct from 'creator' then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  delete from public.members where band_id = p_band and user_id = p_user and role <> 'creator';
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
end $$;

-- Anyone but the creator can leave on their own.
create function public.leave_band(p_band uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(p_band) = 'creator' then
    raise exception 'creator_cannot_leave' using errcode = '42501';
  end if;
  delete from public.members where band_id = p_band and user_id = auth.uid();
end $$;

-- Only signed-in users may call anything.
revoke all on function
  public.member_role(uuid), public.is_member(uuid), public.create_band(uuid, text), public.upsert_records(uuid, jsonb),
  public.create_invitation(uuid, text, text), public.revoke_invitation(uuid), public.invitation_preview(text),
  public.accept_invitation(text), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.leave_band(uuid)
  from public, anon;
grant execute on function
  public.member_role(uuid), public.is_member(uuid), public.create_band(uuid, text), public.upsert_records(uuid, jsonb),
  public.create_invitation(uuid, text, text), public.revoke_invitation(uuid), public.invitation_preview(text),
  public.accept_invitation(text), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.leave_band(uuid)
  to authenticated;

-- Live updates: devices subscribe to changes of `records` (Realtime respects the select policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
