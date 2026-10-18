-- Stage 9: buying Tondolo with Stripe Checkout (Stripe's Managed Payments, so Stripe is the merchant
-- of record and handles VAT and sales tax). A paid checkout unlocks the wedding. Only the server
-- (service role) records and completes purchases; the owner can see their own.
-- Also Mags's decisions of 18 October 2026: planners get payment reminders by default, and family
-- get reminders for the payments they've agreed to cover (no weekly summary).

-- ---------------------------------------------------------------- purchases

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  buyer uuid references auth.users (id) on delete set null,
  stripe_session_id text not null unique check (stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'),
  currency text not null check (currency in ('GBP', 'USD', 'EUR')),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'open' check (status in ('open', 'paid', 'expired')),
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index purchases_wedding on public.purchases (wedding_id, created_at desc);

alter table public.purchases enable row level security;
create policy purchases_owner on public.purchases for select to authenticated
  using (public.member_role_in(wedding_id) = 'owner');
revoke all on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;

-- Marks a checkout paid and unlocks its wedding. Safe to call twice (the webhook and the return page
-- may both confirm the same payment). The amount and currency must match what was offered.
-- Server only.
create function public.complete_purchase(p_session text, p_amount bigint, p_currency text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.purchases;
begin
  select * into p from public.purchases where stripe_session_id = p_session for update;
  if p.id is null then raise exception 'unknown_session' using errcode = 'P0001'; end if;
  if p.amount_minor <> p_amount or p.currency <> upper(p_currency) then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  if p.status <> 'paid' then
    update public.purchases set status = 'paid', paid_at = now() where id = p.id;
  end if;
  update public.weddings set unlocked_at = coalesce(unlocked_at, now()) where id = p.wedding_id;
  return p.wedding_id;
end $$;

create function public.expire_purchase(p_session text) returns void
language sql security definer set search_path = '' as $$
  update public.purchases set status = 'expired' where stripe_session_id = p_session and status = 'open'
$$;

revoke execute on function public.complete_purchase(text, bigint, text), public.expire_purchase(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- reminders for planners and family

-- Everyone gets due-date reminders unless they turn them off. Family reminders cover only the
-- payments they're paying for (see reminders_to_send).
create or replace function public.default_member_emails() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.email_reminders := true;
  end if;
  return new;
end $$;

update public.members set email_reminders = true where status = 'active' and role in ('planner', 'family') and not email_reminders;

-- Family can have reminders but not the weekly summary (it shows the whole wedding's totals).
create or replace function public.set_my_emails(p_wedding uuid, p_reminders boolean, p_weekly boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := public.member_role_in(p_wedding);
begin
  if r is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if r = 'family' and p_weekly then raise exception 'family_weekly_off' using errcode = 'P0001'; end if;
  update public.members set email_reminders = p_reminders, weekly_summary = p_weekly and r <> 'family'
  where wedding_id = p_wedding and user_id = auth.uid() and status = 'active';
end $$;

create or replace function public.reminders_to_send(p_today date)
returns table (
  member_id uuid, wedding_id uuid, payment_id uuid, kind text, email text, display_name text,
  names text, destination text, wedding_date date, home_currency text, home_minor_digits int,
  title text, amount_minor bigint, currency text, minor_digits int, home_minor bigint, due_on date, days_left int,
  supplier_name text, payer_name text, method text
)
language sql stable security definer set search_path = '' as $$
  select m.id, w.id, p.id,
    case when p.due_on - p_today <= 3 then 'due_3' else 'due_14' end,
    u.email::text, m.display_name, w.names, w.destination, w.wedding_date, w.home_currency, hc.minor,
    p.title, p.amount_minor, p.currency, pc.minor,
    public.convert_minor(p.amount_minor, p.currency, w.home_currency, p_today),
    p.due_on, (p.due_on - p_today)::int,
    s.name, payer.display_name, p.method
  from public.members m
  join auth.users u on u.id = m.user_id
  join public.weddings w on w.id = m.wedding_id
  join public.currencies hc on hc.code = w.home_currency
  join public.payments p on p.wedding_id = w.id
  join public.currencies pc on pc.code = p.currency
  left join public.suppliers s on s.id = p.supplier_id
  left join public.members payer on payer.id = p.paying_member_id
  where m.status = 'active' and m.email_reminders
    and (m.role in ('owner', 'partner', 'planner') or (m.role = 'family' and p.paying_member_id = m.id))
    and u.email is not null
    and not p.is_estimate and p.status = 'due' and p.due_on is not null
    and p.due_on - p_today between 0 and 14
    and not exists (
      select 1 from public.alert_log l
      where l.member_id = m.id and l.payment_id = p.id and l.sent_for = p.due_on
        and l.kind = case when p.due_on - p_today <= 3 then 'due_3' else 'due_14' end
    )
  order by m.id, p.due_on, p.title
$$;
revoke execute on function public.reminders_to_send(date) from public, anon, authenticated;
