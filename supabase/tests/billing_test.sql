-- Buying Tondolo: purchases are recorded and completed only by the server, a paid checkout unlocks
-- the wedding once, and the amount must match. Rolls back; ends with ALL BILLING TESTS PASSED.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"f1","sam":"f2"}';
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

select pg_temp.act_as('ade');
select set_config('t.wid', public.create_wedding('GBP', '2027-06-26', 'Porto, Portugal', 'Ade & Sam', 5800000, true, 'Ade')::text, true);
select set_config('t.sam', public.invite_member(current_setting('t.wid')::uuid, 'partner', 'Sam', 'sam@example.test'), true);
reset role;
select pg_temp.act_as('sam'); select public.accept_invite(current_setting('t.sam')); reset role;

-- Nobody signed in can record, complete or change a purchase themselves.
select pg_temp.act_as('ade');
select pg_temp.expect_error($$insert into public.purchases (wedding_id, stripe_session_id, currency, amount_minor) values (current_setting('t.wid')::uuid, 'cs_test_fake', 'GBP', 1)$$, '42501', 'the app can''t record a purchase');
select pg_temp.expect_error($$select public.complete_purchase('cs_test_fake', 4900, 'gbp')$$, '42501', 'the app can''t complete a purchase');
select pg_temp.expect_error($$update public.weddings set unlocked_at = now() where id = current_setting('t.wid')::uuid$$, '42501', 'the app can''t unlock a wedding');
reset role;

-- The server records the checkout it started.
insert into public.purchases (wedding_id, buyer, stripe_session_id, currency, amount_minor)
values (current_setting('t.wid')::uuid, '00000000-0000-4000-8000-0000000000f1', 'cs_test_a1', 'GBP', 4900);
select pg_temp.expect_error($$insert into public.purchases (wedding_id, stripe_session_id, currency, amount_minor) values (current_setting('t.wid')::uuid, 'cs_test_b', 'NGN', 4900)$$, '23514', 'only pounds, dollars and euros');

select pg_temp.act_as('ade');
do $$ begin assert (select count(*) from public.purchases) = 1, 'the owner sees their purchase'; end $$;
reset role;
select pg_temp.act_as('sam');
do $$ begin assert (select count(*) from public.purchases) = 0, 'billing is the owner''s'; end $$;
reset role;

-- A wrong amount never unlocks; the right one does, once, however many times Stripe says so.
select pg_temp.expect_error($$select public.complete_purchase('cs_test_a1', 100, 'gbp')$$, 'amount_mismatch', 'the amount must match');
select pg_temp.expect_error($$select public.complete_purchase('cs_test_a1', 4900, 'usd')$$, 'amount_mismatch', 'the currency must match');
select pg_temp.expect_error($$select public.complete_purchase('cs_test_nope', 4900, 'gbp')$$, 'unknown_session', 'unknown checkouts are refused');
do $$ begin assert (select unlocked_at is null from public.weddings where id = current_setting('t.wid')::uuid), 'still locked'; end $$;
select public.complete_purchase('cs_test_a1', 4900, 'gbp');
select set_config('t.at', (select unlocked_at::text from public.weddings where id = current_setting('t.wid')::uuid), true);
select public.complete_purchase('cs_test_a1', 4900, 'gbp');
do $$ begin
  assert (select status from public.purchases where stripe_session_id = 'cs_test_a1') = 'paid', 'marked paid';
  assert (select unlocked_at::text from public.weddings where id = current_setting('t.wid')::uuid) = current_setting('t.at'), 'unlocked once; a repeat changes nothing';
end $$;

-- Expiring only touches open checkouts.
insert into public.purchases (wedding_id, stripe_session_id, currency, amount_minor) values (current_setting('t.wid')::uuid, 'cs_test_c3', 'EUR', 5500);
select public.expire_purchase('cs_test_c3');
select public.expire_purchase('cs_test_a1');
do $$ begin
  assert (select status from public.purchases where stripe_session_id = 'cs_test_c3') = 'expired', 'an abandoned checkout expires';
  assert (select status from public.purchases where stripe_session_id = 'cs_test_a1') = 'paid', 'a paid one stays paid';
end $$;

select 'ALL BILLING TESTS PASSED' as result;
rollback;
