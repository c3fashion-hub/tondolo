-- Money rules: conversion, rate locking, statement amounts, the free limit, budgets and the wedding date.
-- Runs in one transaction with made-up rates and rolls back. Expected figures were worked out separately.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'magali@example.test'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test');

-- Made-up rates: a month ago 1 GBP = 1.25 EUR; today 1.20. XOF 780 and MAD missing until later.
insert into public.rates (on_date, currency, per_gbp, source) values
  (current_date - 30, 'EUR', 1.25, 'test'), (current_date, 'EUR', 1.20, 'test'), (current_date - 30, 'XOF', 780, 'test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"b1","magali":"b3","mum":"b4"}';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000' || (ids ->> who), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: % (no error raised)', label;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  if position(expected in sqlerrm) = 0 and sqlstate <> expected then
    raise exception 'FAILED: % (got "%" / %)', label, sqlerrm, sqlstate;
  end if;
end $$;

create function pg_temp.locked(t text) returns bigint language sql as $$
  select locked_home_minor from public.payments where title = t
$$;

-- Conversion, rounding and currencies without minor units.
do $$ begin
  assert public.convert_minor(100000, 'EUR', 'GBP', current_date - 30) = 80000, '€1,000 is £800 at 1.25';
  assert public.convert_minor(100000, 'EUR', 'GBP', current_date - 10) = 80000, 'a day without rates uses the latest before it';
  assert public.convert_minor(655957, 'XOF', 'EUR', current_date - 30) = 105121, 'XOF has no minor units';
  assert public.convert_minor(1, 'EUR', 'GBP', current_date) = 1, 'rounds half up';
  assert public.convert_minor(100, 'MAD', 'GBP', current_date) is null, 'no rate, no guess';
  assert public.convert_minor(5000, 'GBP', 'GBP', current_date) = 5000, 'same currency unchanged';
end $$;

select pg_temp.act_as('ade');
select set_config('t.wid', public.create_wedding('GBP', (current_date + 250)::date, 'Porto, Portugal', 'Ade & Sam', 5000000, true, 'Ade')::text, true);
select set_config('t.magali', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Magali', 'magali@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
reset role;
select pg_temp.act_as('magali'); select public.accept_invite(current_setting('t.magali')); reset role;
select pg_temp.act_as('mum');  select public.accept_invite(current_setting('t.mum'));  reset role;

-- A paid amount locks at the rate on the day paid and keeps it when rates move.
select pg_temp.act_as('ade');
insert into public.payments (wedding_id, title, amount_minor, currency, status, paid_on)
values (current_setting('t.wid')::uuid, 'Venue deposit', 100000, 'EUR', 'paid', current_date - 30);
do $$ begin assert pg_temp.locked('Venue deposit') = 80000, 'locked at the rate on the day paid'; end $$;
reset role;
insert into public.rates (on_date, currency, per_gbp, source) values (current_date + 1, 'EUR', 1.10, 'test'); -- tomorrow's rate update
select pg_temp.act_as('ade');
update public.payments set title = 'Venue deposit', notes = 'Paid by transfer' where title = 'Venue deposit';
do $$ begin
  assert pg_temp.locked('Venue deposit') = 80000, 'rates moving never changes a locked amount';
  assert (select locked_home_currency from public.payments where title = 'Venue deposit') = 'GBP', 'locked in the home currency';
end $$;

-- Changing the payment itself works it out again; a statement amount wins.
update public.payments set amount_minor = 200000 where title = 'Venue deposit';
do $$ begin assert pg_temp.locked('Venue deposit') = 160000, 'new amount relocks at the same day''s rate'; end $$;
update public.payments set statement_minor = 165000 where title = 'Venue deposit';
do $$ begin assert pg_temp.locked('Venue deposit') = 165000, 'the statement amount is the locked amount'; end $$;
select pg_temp.expect_error($$update public.payments set locked_home_minor = 1 where title = 'Venue deposit'$$, '42501', 'nobody can type a locked amount');

-- Back to still to pay: nothing stays locked.
update public.payments set status = 'due' where title = 'Venue deposit';
do $$ begin
  assert pg_temp.locked('Venue deposit') is null, 'unpaid amounts are not locked';
  assert (select statement_minor from public.payments where title = 'Venue deposit') is null, 'statement amount cleared';
  assert (select paid_on from public.payments where title = 'Venue deposit') is null, 'date paid cleared';
end $$;

-- Home-currency payments lock at face value; marking paid without a date uses today.
insert into public.payments (wedding_id, title, amount_minor, currency, status)
values (current_setting('t.wid')::uuid, 'Planner fee', 150000, 'GBP', 'paid');
do $$ begin
  assert pg_temp.locked('Planner fee') = 150000, 'pounds lock as pounds';
  assert (select paid_on from public.payments where title = 'Planner fee') = current_date, 'date paid defaults to today';
end $$;

-- A payment in a currency with no rate yet waits, then locks at that day's rate once it arrives.
insert into public.payments (wedding_id, title, amount_minor, currency, status, paid_on)
values (current_setting('t.wid')::uuid, 'DJ deposit', 1200000, 'MAD', 'paid', current_date - 30);
do $$ begin assert pg_temp.locked('DJ deposit') is null, 'no rate yet, so nothing is guessed'; end $$;
reset role;
insert into public.rates (on_date, currency, per_gbp, source) values (current_date - 30, 'MAD', 12.5, 'test');
do $$ begin
  assert public.fill_missing_locks() = 0, 'nothing left waiting';
  assert pg_temp.locked('DJ deposit') = 96000, 'filled in at the rate on the day paid';
end $$;

-- Free start: up to 5 real payments. Estimates don't count, but turning one into a real payment does.
select pg_temp.act_as('ade');
insert into public.payments (wedding_id, title, amount_minor, currency) values
  (current_setting('t.wid')::uuid, 'Photographer', 100000, 'EUR'),
  (current_setting('t.wid')::uuid, 'Caterer', 100000, 'EUR');
insert into public.payments (wedding_id, title, amount_minor, currency, is_estimate, due_offset_days, due_on)
values (current_setting('t.wid')::uuid, 'Flights (estimate)', 90000, 'GBP', true, 60, (current_date + 190)::date);
select pg_temp.expect_error($$insert into public.payments (wedding_id, title, amount_minor, currency) values (current_setting('t.wid')::uuid, 'Sixth', 100, 'GBP')$$, 'free_limit', 'sixth real payment needs unlocking');
select pg_temp.expect_error($$update public.payments set is_estimate = false where title = 'Flights (estimate)'$$, 'free_limit', 'an estimate made real counts too');
reset role;
update public.weddings set unlocked_at = now() where id = current_setting('t.wid')::uuid; -- as checkout will (stage 9)
select pg_temp.act_as('ade');
insert into public.payments (wedding_id, title, amount_minor, currency) values (current_setting('t.wid')::uuid, 'Sixth', 100, 'GBP');

-- Moving the wedding date moves estimates planned from it, and nothing else.
update public.weddings set wedding_date = wedding_date + 14 where id = current_setting('t.wid')::uuid;
do $$ begin
  assert (select due_on from public.payments where title = 'Flights (estimate)') = current_date + 204, 'estimate follows the date';
end $$;

-- Budgets: the couple and planner can set them; family can't see them.
insert into public.budgets (wedding_id, category, amount_minor) values (current_setting('t.wid')::uuid, 'Venue hire', 500000);
reset role;
select pg_temp.act_as('magali');
do $$ begin assert (select count(*) from public.budgets) = 1, 'planner sees the budget'; end $$;
update public.budgets set amount_minor = 520000 where category = 'Venue hire';
reset role;
select pg_temp.act_as('mum');
do $$ begin assert (select count(*) from public.budgets) = 0, 'family can''t see the budget'; end $$;
select pg_temp.expect_error($$insert into public.budgets (wedding_id, category, amount_minor) values (current_setting('t.wid')::uuid, 'Cake', 1)$$, '42501', 'family can''t set a budget');

-- Family can name a new supplier on a payment they cover, and then see it.
select set_config('t.mum_id', public.my_member_id(current_setting('t.wid')::uuid)::text, true);
insert into public.payments (wedding_id, title, amount_minor, currency, paying_member_id, supplier_id)
values (current_setting('t.wid')::uuid, 'Cake', 40000, 'EUR', current_setting('t.mum_id')::uuid, public.ensure_supplier(current_setting('t.wid')::uuid, 'Doces da Avó'));
do $$ begin
  assert (select count(*) from public.suppliers) = 1, 'family sees only the supplier on her payment';
  assert public.ensure_supplier(current_setting('t.wid')::uuid, 'doces da avó') = (select id from public.suppliers), 'same supplier whatever the capitals';
end $$;
reset role;

-- Changing the home currency re-expresses the budget at today's rate; locked amounts stay as they were.
select pg_temp.act_as('ade');
update public.weddings set home_currency = 'EUR' where id = current_setting('t.wid')::uuid;
do $$ begin
  assert (select amount_minor from public.budgets where category = 'Venue hire') = 624000, 'budget converted at today''s rate (5,200 x 1.20)';
  assert pg_temp.locked('Planner fee') = 150000 and (select locked_home_currency from public.payments where title = 'Planner fee') = 'GBP', 'locked amounts keep their original currency';
end $$;
reset role;

select 'ALL MONEY TESTS PASSED' as result;
rollback;
