-- Stage 3: currencies, daily rates, conversion and rate locking, suppliers, budgets,
-- the free-start limit, and estimates that follow the wedding date.

-- ---------------------------------------------------------------- currencies and rates

create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor smallint not null check (minor in (0, 2, 3))
);

insert into public.currencies (code, name, minor) values
  ('GBP','British pound',2),('EUR','Euro',2),('USD','US dollar',2),('CAD','Canadian dollar',2),('AUD','Australian dollar',2),
  ('NZD','New Zealand dollar',2),('CHF','Swiss franc',2),('AED','UAE dirham',2),('MAD','Moroccan dirham',2),('NGN','Nigerian naira',2),
  ('GHS','Ghanaian cedi',2),('KES','Kenyan shilling',2),('ZAR','South African rand',2),('XOF','West African CFA franc',0),('JMD','Jamaican dollar',2),
  ('MXN','Mexican peso',2),('THB','Thai baht',2),('IDR','Indonesian rupiah',2),('TRY','Turkish lira',2),('INR','Indian rupee',2),
  ('HKD','Hong Kong dollar',2),('JPY','Japanese yen',0),('CNY','Chinese yuan',2),('SGD','Singapore dollar',2),('SEK','Swedish krona',2),
  ('NOK','Norwegian krone',2),('DKK','Danish krone',2),('PLN','Polish zloty',2),('CZK','Czech koruna',2),('HUF','Hungarian forint',2),
  ('TND','Tunisian dinar',3),('EGP','Egyptian pound',2);

-- One row per currency per day: how many units of the currency one pound buys (mid-market).
create table public.rates (
  on_date date not null,
  currency char(3) not null references public.currencies (code),
  per_gbp numeric(24, 10) not null check (per_gbp > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (on_date, currency)
);

alter table public.currencies enable row level security;
alter table public.rates enable row level security;
create policy currencies_read on public.currencies for select to authenticated using (true);
create policy rates_read on public.rates for select to authenticated using (true);
revoke all on public.currencies, public.rates from anon, authenticated;
grant select on public.currencies, public.rates to authenticated;

-- The rate for a day: that day's, else the latest before it, else the earliest we have.
create function public.rate_per_gbp(c text, d date) returns numeric
language sql stable set search_path = '' as $$
  select case when c = 'GBP' then 1::numeric else coalesce(
    (select per_gbp from public.rates where currency = c and on_date <= d order by on_date desc limit 1),
    (select per_gbp from public.rates where currency = c order by on_date asc limit 1)
  ) end
$$;

-- Converts minor units between currencies at a day's rates, rounding half up. Null if a rate is missing.
create function public.convert_minor(amount bigint, from_c text, to_c text, d date) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  pf numeric := public.rate_per_gbp(from_c, d);
  pt numeric := public.rate_per_gbp(to_c, d);
  mf int := (select minor from public.currencies where code = from_c);
  mt int := (select minor from public.currencies where code = to_c);
begin
  if amount is null then return null; end if;
  if from_c = to_c then return amount; end if;
  if pf is null or pt is null or mf is null or mt is null then return null; end if;
  return round(amount::numeric * power(10::numeric, mt) * pt / (pf * power(10::numeric, mf)))::bigint;
end $$;

-- ---------------------------------------------------------------- suppliers

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create unique index suppliers_name on public.suppliers (wedding_id, lower(name));

-- ---------------------------------------------------------------- payments: the rest of the fields

alter table public.payments
  add column supplier_id uuid references public.suppliers (id) on delete set null,
  add column category text check (category is null or char_length(category) <= 80),
  add column method text check (method is null or method in ('credit_card', 'debit_card', 'bank_transfer', 'cash', 'paypal', 'other')),
  add column protected text not null default 'not_sure' check (protected in ('yes', 'no', 'not_sure')),
  add column tax_included boolean,
  add column tax_rate_bp integer check (tax_rate_bp is null or tax_rate_bp between 0 and 10000),
  add column fees_minor bigint check (fees_minor is null or fees_minor >= 0),
  add column statement_minor bigint check (statement_minor is null or statement_minor > 0),
  add column locked_home_minor bigint,
  add column locked_home_currency char(3),
  add column locked_at timestamptz,
  add column due_offset_days integer,
  add column notes text check (notes is null or char_length(notes) <= 1000);

create index payments_supplier on public.payments (supplier_id);

grant update (supplier_id, category, method, protected, tax_included, tax_rate_bp, fees_minor, statement_minor, notes, due_offset_days)
  on public.payments to authenticated;

-- Locks a paid amount in the home currency: the statement amount if given, else the rate on the day paid.
-- It's worked out again only when the payment itself changes, never because rates moved.
create function public.lock_paid_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  home text;
begin
  if new.status = 'paid' then
    new.paid_on := coalesce(new.paid_on, current_date);
    if tg_op = 'INSERT' or old.status <> 'paid' or new.amount_minor <> old.amount_minor or new.currency <> old.currency
       or new.paid_on is distinct from old.paid_on or new.statement_minor is distinct from old.statement_minor
       or old.locked_home_minor is null then
      select home_currency into home from public.weddings where id = new.wedding_id;
      new.locked_home_currency := home;
      new.locked_home_minor := case
        when new.currency = home then new.amount_minor
        when new.statement_minor is not null then new.statement_minor
        else public.convert_minor(new.amount_minor, new.currency, home, new.paid_on)
      end;
      new.locked_at := now();
    else
      new.locked_home_minor := old.locked_home_minor;
      new.locked_home_currency := old.locked_home_currency;
      new.locked_at := old.locked_at;
    end if;
  else
    new.paid_on := null;
    new.statement_minor := null;
    new.locked_home_minor := null;
    new.locked_home_currency := null;
    new.locked_at := null;
  end if;
  return new;
end $$;

create trigger payments_lock before insert or update on public.payments
for each row execute function public.lock_paid_amount();

-- Free start: up to 5 real payments (estimates from the starter budget don't count) until unlocked.
create function public.enforce_free_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_estimate or (tg_op = 'UPDATE' and not old.is_estimate) then return new; end if;
  if (select unlocked_at from public.weddings where id = new.wedding_id) is null
     and (select count(*) from public.payments where wedding_id = new.wedding_id and not is_estimate and id <> new.id) >= 5 then
    raise exception 'free_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger payments_free_limit before insert or update of is_estimate on public.payments
for each row execute function public.enforce_free_limit();

-- Fills in any paid amount that couldn't be locked because that day's rate wasn't stored yet.
-- Touching the row lets the lock trigger work it out now that the rate exists.
create function public.fill_missing_locks() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.payments set locked_at = now()
  where status = 'paid' and locked_home_minor is null;
  select count(*) into n from public.payments where status = 'paid' and locked_home_minor is null;
  return n; -- how many are still waiting for a rate
end $$;

-- ---------------------------------------------------------------- budgets

create table public.budgets (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, category)
);

-- ---------------------------------------------------------------- the wedding date and currency drive the rest

-- Moving the date moves each estimate that was planned from it; changing the home currency
-- re-expresses the budget at today's rate. Paid amounts keep their locked value.
create function public.follow_wedding_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.wedding_date <> old.wedding_date then
    update public.payments
    set due_on = least(new.wedding_date, greatest(new.wedding_date - due_offset_days, current_date + 7))
    where wedding_id = new.id and is_estimate and due_offset_days is not null;
  end if;
  if new.home_currency <> old.home_currency then
    update public.budgets
    set amount_minor = coalesce(public.convert_minor(amount_minor, old.home_currency, new.home_currency, current_date), amount_minor)
    where wedding_id = new.id;
    new.rough_budget_minor := public.convert_minor(old.rough_budget_minor, old.home_currency, new.home_currency, current_date);
  end if;
  return new;
end $$;

create trigger weddings_follow before update of wedding_date, home_currency on public.weddings
for each row execute function public.follow_wedding_changes();

-- ---------------------------------------------------------------- row-level security

alter table public.suppliers enable row level security;
alter table public.budgets enable row level security;

-- Couple and planner work with all suppliers; family see and add only suppliers on payments they cover.
create policy suppliers_select on public.suppliers for select to authenticated
  using (
    public.member_role_in(wedding_id) in ('owner', 'partner', 'planner')
    or (public.member_role_in(wedding_id) = 'family' and exists (
      select 1 from public.payments p where p.supplier_id = suppliers.id and p.paying_member_id = public.my_member_id(suppliers.wedding_id)))
  );
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.member_role_in(wedding_id) is not null);
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));

-- The budget belongs to the couple and the planner; family never see it.
create policy budgets_all on public.budgets for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));

-- Finds or creates a supplier by name, for anyone in the wedding (family included, who can't
-- otherwise see suppliers until a payment they cover points at one).
create function public.ensure_supplier(p_wedding uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(trim(p_name), 120);
  sid uuid;
begin
  if public.member_role_in(p_wedding) is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_name = '' then return null; end if;
  select id into sid from public.suppliers where wedding_id = p_wedding and lower(name) = lower(v_name);
  if sid is null then
    insert into public.suppliers (wedding_id, name) values (p_wedding, v_name)
    on conflict (wedding_id, lower(name)) do nothing returning id into sid;
    if sid is null then
      select id into sid from public.suppliers where wedding_id = p_wedding and lower(name) = lower(v_name);
    end if;
  end if;
  return sid;
end $$;

revoke all on public.suppliers, public.budgets from anon, authenticated;
grant select, insert, delete on public.suppliers to authenticated;
grant update (name) on public.suppliers to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

revoke execute on function public.lock_paid_amount(), public.enforce_free_limit(), public.follow_wedding_changes(), public.fill_missing_locks()
  from public, anon, authenticated;
grant execute on function public.rate_per_gbp(text, date), public.convert_minor(bigint, text, text, date), public.ensure_supplier(uuid, text) to authenticated;
