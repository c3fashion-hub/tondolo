-- Stage 2: weddings, the five places (members) and payments, with row-level security.
-- Every rule is enforced here, so it holds whatever the app does.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('owner', 'partner', 'planner', 'family');
create type public.member_status as enum ('invited', 'active', 'removed');

-- ---------------------------------------------------------------- tables

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  home_currency char(3) not null check (home_currency ~ '^[A-Z]{3}$'),
  wedding_date date not null,
  destination text not null check (char_length(destination) between 1 and 120),
  names text check (names is null or char_length(names) between 1 and 80),
  rough_budget_minor bigint check (rough_budget_minor is null or rough_budget_minor > 0),
  starter_used boolean not null default false,
  unlocked_at timestamptz, -- set only by checkout (stage 9)
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'invited',
  display_name text not null check (char_length(display_name) between 1 and 60),
  invite_email extensions.citext,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  payer_currency char(3) check (payer_currency is null or payer_currency ~ '^[A-Z]{3}$'),
  invited_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  check (status <> 'active' or user_id is not null),
  check (status <> 'invited' or (invite_email is not null and invite_token_hash is not null))
);

create unique index members_one_owner on public.members (wedding_id) where role = 'owner' and status <> 'removed';
create unique index members_one_place_per_user on public.members (wedding_id, user_id) where status <> 'removed' and user_id is not null;
create unique index members_one_invite_per_email on public.members (wedding_id, invite_email) where status = 'invited';
create index members_user_active on public.members (user_id) where status = 'active';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'due' check (status in ('due', 'paid')),
  due_on date,
  paid_on date,
  is_estimate boolean not null default false,
  paying_member_id uuid references public.members (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_wedding on public.payments (wedding_id);

-- ---------------------------------------------------------------- helpers

-- The caller's role in a wedding, or null. SECURITY DEFINER so policies never recurse.
create function public.member_role_in(w uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m
  where m.wedding_id = w and m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1
$$;

create function public.my_member_id(w uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.wedding_id = w and m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1
$$;

create function public.hash_token(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'payments' then new.updated_by := auth.uid(); end if;
  return new;
end $$;

create trigger weddings_touch before update on public.weddings for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- Seats: two partners (the owner is one), one planner, two family members.
create function public.enforce_seats() returns trigger
language plpgsql set search_path = '' as $$
declare
  taken int;
  allowed int;
begin
  if new.status = 'removed' then return new; end if;
  perform 1 from public.weddings where id = new.wedding_id for update; -- serialise seat changes per wedding
  allowed := case new.role when 'owner' then 2 when 'partner' then 2 when 'planner' then 1 else 2 end;
  select count(*) into taken from public.members
  where wedding_id = new.wedding_id and status <> 'removed' and id <> new.id
    and (case when new.role in ('owner', 'partner') then role in ('owner', 'partner') else role = new.role end);
  if taken >= allowed then
    raise exception 'seat_full' using errcode = 'P0001', hint = new.role::text;
  end if;
  return new;
end $$;

create trigger members_seats before insert or update of role, status on public.members
for each row execute function public.enforce_seats();

-- A payment can only be covered by someone in the same wedding.
create function public.check_paying_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.paying_member_id is not null and not exists (
    select 1 from public.members where id = new.paying_member_id and wedding_id = new.wedding_id
  ) then
    raise exception 'paying_member_not_in_wedding' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger payments_paying_member before insert or update of paying_member_id, wedding_id on public.payments
for each row execute function public.check_paying_member();

-- ---------------------------------------------------------------- row-level security

alter table public.weddings enable row level security;
alter table public.members enable row level security;
alter table public.payments enable row level security;

create policy weddings_select on public.weddings for select to authenticated
  using (public.member_role_in(id) is not null);
create policy weddings_update on public.weddings for update to authenticated
  using (public.member_role_in(id) in ('owner', 'partner'))
  with check (public.member_role_in(id) in ('owner', 'partner'));
create policy weddings_delete on public.weddings for delete to authenticated
  using (public.member_role_in(id) = 'owner');

-- Couple and planner see everyone; family see only their own place.
create policy members_select on public.members for select to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner') or user_id = (select auth.uid()));

-- Couple and planner see every payment; family see only the ones they cover.
create policy payments_select on public.payments for select to authenticated
  using (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and paying_member_id = public.my_member_id(wedding_id))
  );
create policy payments_insert on public.payments for insert to authenticated
  with check (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and paying_member_id = public.my_member_id(wedding_id))
  );
create policy payments_update on public.payments for update to authenticated
  using (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and paying_member_id = public.my_member_id(wedding_id))
  )
  with check (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and paying_member_id = public.my_member_id(wedding_id))
  );
create policy payments_delete on public.payments for delete to authenticated
  using (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and paying_member_id = public.my_member_id(wedding_id))
  );

-- Grants: nothing for anonymous visitors; members and weddings change only through the functions below,
-- except the wedding details a partner may edit. unlocked_at is never writable from the app.
revoke all on public.weddings, public.members, public.payments from anon, authenticated;
grant select, delete on public.weddings to authenticated;
grant update (home_currency, wedding_date, destination, names, rough_budget_minor) on public.weddings to authenticated;
grant select on public.members to authenticated;
grant select, insert, delete on public.payments to authenticated;
grant update (title, amount_minor, currency, status, due_on, paid_on, is_estimate, paying_member_id) on public.payments to authenticated;

-- ---------------------------------------------------------------- functions the app calls

-- Creates a wedding with the caller as its owner. One free (not yet unlocked) wedding per person:
-- a second call returns the existing one, so a double tap can't make two.
create function public.create_wedding(
  p_home_currency text, p_wedding_date date, p_destination text, p_names text,
  p_rough_budget_minor bigint, p_starter_used boolean, p_display_name text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  existing uuid;
  wid uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_wedding_date < current_date - 1 then raise exception 'date_in_past' using errcode = 'P0001'; end if;

  select w.id into existing from public.weddings w
  join public.members m on m.wedding_id = w.id
  where m.user_id = uid and m.role = 'owner' and m.status = 'active' and w.unlocked_at is null
  limit 1;
  if existing is not null then return existing; end if;

  insert into public.weddings (home_currency, wedding_date, destination, names, rough_budget_minor, starter_used, created_by)
  values (upper(p_home_currency), p_wedding_date, trim(p_destination), nullif(trim(coalesce(p_names, '')), ''), p_rough_budget_minor, coalesce(p_starter_used, false), uid)
  returning id into wid;

  insert into public.members (wedding_id, user_id, role, status, display_name, accepted_at)
  values (wid, uid, 'owner', 'active', left(coalesce(nullif(trim(p_display_name), ''), 'You'), 60), now());

  return wid;
end $$;

-- Invites someone to a place. Returns the secret link token once; only its hash is stored.
create function public.invite_member(
  p_wedding uuid, p_role public.member_role, p_display_name text, p_email text, p_payer_currency text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_member_id(p_wedding);
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  email text := lower(trim(p_email));
begin
  if public.member_role_in(p_wedding) not in ('owner', 'partner') or me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_role = 'owner' then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.members m join auth.users u on u.id = m.user_id
    where m.wedding_id = p_wedding and m.status = 'active' and lower(u.email) = email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.members (wedding_id, role, status, display_name, invite_email, invite_token_hash, invite_expires_at, payer_currency, invited_by)
  values (p_wedding, p_role, 'invited', left(trim(p_display_name), 60), email, public.hash_token(token), now() + interval '14 days',
          case when p_role = 'family' then upper(nullif(p_payer_currency, '')) end, me);
  return token;
end $$;

-- A fresh link for an invite whose link was lost (the old one stops working).
create function public.reissue_invite(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  w uuid;
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select wedding_id into w from public.members where id = p_member and status = 'invited';
  if w is null or public.member_role_in(w) not in ('owner', 'partner') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.members set invite_token_hash = public.hash_token(token), invite_expires_at = now() + interval '14 days'
  where id = p_member;
  return token;
end $$;

-- What an invite link shows before signing in. Anyone holding the link may see this much.
create function public.peek_invite(p_token text)
returns table (names text, destination text, wedding_date date, role public.member_role, display_name text, invited_by_name text, email_hint text)
language sql stable security definer set search_path = '' as $$
  select w.names, w.destination, w.wedding_date, m.role, m.display_name, inviter.display_name,
         left(m.invite_email::text, 1) || '•••@' || split_part(m.invite_email::text, '@', 2)
  from public.members m
  join public.weddings w on w.id = m.wedding_id
  left join public.members inviter on inviter.id = m.invited_by
  where m.invite_token_hash = public.hash_token(p_token) and m.status = 'invited' and m.invite_expires_at > now()
$$;

-- Accepts an invite. The signed-in email must match the invited email, so a link alone gives no access.
create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  my_email text;
  inv public.members%rowtype;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into inv from public.members
  where invite_token_hash = public.hash_token(p_token) and status = 'invited' and invite_expires_at > now()
  for update;
  if inv.id is null then raise exception 'invite_not_found' using errcode = 'P0001'; end if;

  select lower(email) into my_email from auth.users where id = uid;
  if my_email is distinct from lower(inv.invite_email::text) then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members where wedding_id = inv.wedding_id and user_id = uid and status = 'active') then
    update public.members set status = 'removed', removed_at = now(), invite_token_hash = null where id = inv.id;
    return inv.wedding_id;
  end if;

  update public.members
  set user_id = uid, status = 'active', accepted_at = now(), invite_token_hash = null, invite_expires_at = null
  where id = inv.id;
  return inv.wedding_id;
end $$;

-- Changes someone's place. The owner's place can't be changed or removed.
create function public.update_member(p_member uuid, p_role public.member_role, p_display_name text, p_payer_currency text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.members%rowtype;
begin
  select * into target from public.members where id = p_member and status <> 'removed';
  if target.id is null or public.member_role_in(target.wedding_id) not in ('owner', 'partner') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if target.role = 'owner' or p_role = 'owner' then
    if not (target.role = 'owner' and p_role = 'owner') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  end if;
  update public.members
  set role = p_role, display_name = left(trim(p_display_name), 60),
      payer_currency = case when p_role = 'family' then upper(nullif(p_payer_currency, '')) end
  where id = p_member;
end $$;

-- Removes someone. They lose access immediately.
create function public.remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.members%rowtype;
begin
  select * into target from public.members where id = p_member and status <> 'removed';
  if target.id is null or public.member_role_in(target.wedding_id) not in ('owner', 'partner') or target.role = 'owner' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.members set status = 'removed', removed_at = now(), invite_token_hash = null, invite_expires_at = null
  where id = p_member;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.member_role_in(uuid), public.my_member_id(uuid),
  public.create_wedding(text, date, text, text, bigint, boolean, text),
  public.invite_member(uuid, public.member_role, text, text, text),
  public.reissue_invite(uuid), public.accept_invite(text),
  public.update_member(uuid, public.member_role, text, text), public.remove_member(uuid)
  to authenticated;
grant execute on function public.peek_invite(text) to anon, authenticated;
