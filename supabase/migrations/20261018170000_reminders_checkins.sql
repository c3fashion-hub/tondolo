-- Stage 7: reminder emails 14 and 3 days before each due date, the weekly summary email, and the
-- weekly check-in slot. Each person chooses their own emails. Family emails stay off until Mags
-- decides (CLAUDE.md: messages to family are her call).

-- ---------------------------------------------------------------- each person's email choices

alter table public.members
  add column email_reminders boolean not null default false,
  add column weekly_summary boolean not null default false;

-- The couple get due-date reminders unless they turn them off; everyone else chooses to have them.
create function public.default_member_emails() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and new.role in ('owner', 'partner')
     and (tg_op = 'INSERT' or old.status <> 'active') then
    new.email_reminders := true;
  end if;
  return new;
end $$;
create trigger members_default_emails before insert or update of status on public.members
for each row execute function public.default_member_emails();
revoke execute on function public.default_member_emails() from public, anon, authenticated;

update public.members set email_reminders = true where status = 'active' and role in ('owner', 'partner');

-- A person changes only their own choices. Family can't turn emails on yet.
create function public.set_my_emails(p_wedding uuid, p_reminders boolean, p_weekly boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := public.member_role_in(p_wedding);
begin
  if r is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if r = 'family' and (p_reminders or p_weekly) then raise exception 'family_emails_off' using errcode = 'P0001'; end if;
  update public.members set email_reminders = p_reminders, weekly_summary = p_weekly
  where wedding_id = p_wedding and user_id = auth.uid() and status = 'active';
end $$;
revoke execute on function public.set_my_emails(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_my_emails(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------- the weekly check-in

-- day and second_day are ISO weekdays (1 Monday … 7 Sunday). The second day applies in the final
-- six weeks, when the spec moves to twice a week.
create table public.checkins (
  wedding_id uuid primary key references public.weddings (id) on delete cascade,
  day smallint not null default 7 check (day between 1 and 7),
  at_time text not null default '19:00' check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  second_day smallint check (second_day is null or second_day between 1 and 7),
  time_zone text not null default 'Europe/London' check (char_length(time_zone) between 3 and 60),
  updated_at timestamptz not null default now(),
  check (second_day is null or second_day <> day)
);
alter table public.checkins enable row level security;
create policy checkins_read on public.checkins for select to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));
create policy checkins_write on public.checkins for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner'));
revoke all on public.checkins from anon, authenticated;
grant select, insert, update, delete on public.checkins to authenticated;

-- ---------------------------------------------------------------- what's been sent

-- One row per email sent, so nothing is sent twice, even if the daily job runs again or a day is missed.
-- sent_for is the due date for reminders (a moved date gets its own reminder) and the day for summaries.
create table public.alert_log (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  kind text not null check (kind in ('due_14', 'due_3', 'weekly', 'test')),
  sent_for date not null,
  sent_at timestamptz not null default now()
);
create unique index alert_log_once on public.alert_log (member_id, coalesce(payment_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, sent_for)
  where kind <> 'test';
alter table public.alert_log enable row level security; -- no policies: only the server's email job uses it
revoke all on public.alert_log from anon, authenticated;

-- ---------------------------------------------------------------- what the daily job sends

-- Due-date reminders for one day: 14 days ahead (from 14 down to 4 days, so a payment added late still
-- gets one) and 3 days ahead (3 down to the day itself). Real payments still to pay only, to people who
-- can see them and have reminders on. Server only (service role).
create function public.reminders_to_send(p_today date)
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
  where m.status = 'active' and m.email_reminders and m.role in ('owner', 'partner', 'planner')
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

-- Weekly summaries due today: on the wedding's check-in day (Sunday if none is set), to people who
-- chose them. One row per person, with what the email needs. Server only.
create function public.summaries_to_send(p_today date)
returns table (
  member_id uuid, wedding_id uuid, email text, display_name text, names text, destination text, wedding_date date,
  home_currency text, home_minor_digits int, committed bigint, paid bigint, checkin_time text, due_soon jsonb, overdue jsonb
)
language sql stable security definer set search_path = '' as $$
  select m.id, w.id, u.email::text, m.display_name, w.names, w.destination, w.wedding_date, w.home_currency, hc.minor,
    t.committed, t.paid, c.at_time,
    coalesce((select jsonb_agg(jsonb_build_object('title', p.title, 'amount_minor', p.amount_minor, 'currency', p.currency, 'minor_digits', pc.minor,
        'home_minor', public.convert_minor(p.amount_minor, p.currency, w.home_currency, p_today), 'due_on', p.due_on) order by p.due_on)
      from public.payments p join public.currencies pc on pc.code = p.currency
      where p.wedding_id = w.id and not p.is_estimate and p.status = 'due' and p.due_on between p_today and p_today + 14), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('title', p.title, 'amount_minor', p.amount_minor, 'currency', p.currency, 'minor_digits', pc.minor,
        'due_on', p.due_on) order by p.due_on)
      from public.payments p join public.currencies pc on pc.code = p.currency
      where p.wedding_id = w.id and not p.is_estimate and p.status = 'due' and p.due_on < p_today), '[]'::jsonb)
  from public.members m
  join auth.users u on u.id = m.user_id
  join public.weddings w on w.id = m.wedding_id
  join public.currencies hc on hc.code = w.home_currency
  left join public.checkins c on c.wedding_id = w.id
  cross join lateral (
    select coalesce(sum(v.home_minor), 0)::bigint as committed, coalesce(sum(v.home_minor) filter (where v.status = 'paid'), 0)::bigint as paid
    from (
      select p.status,
        case when p.status = 'paid' then
          case when p.locked_home_currency = w.home_currency then p.locked_home_minor
               else public.convert_minor(p.locked_home_minor, p.locked_home_currency, w.home_currency, p.paid_on) end
        else public.convert_minor(p.amount_minor, p.currency, w.home_currency, p_today) end as home_minor
      from public.payments p where p.wedding_id = w.id and not p.is_estimate
    ) v
  ) t
  where m.status = 'active' and m.weekly_summary and m.role in ('owner', 'partner', 'planner')
    and u.email is not null
    and extract(isodow from p_today) = coalesce(c.day, 7)
    and p_today <= w.wedding_date
    and not exists (select 1 from public.alert_log l where l.member_id = m.id and l.kind = 'weekly' and l.sent_for = p_today)
$$;

revoke execute on function public.reminders_to_send(date), public.summaries_to_send(date) from public, anon, authenticated;
