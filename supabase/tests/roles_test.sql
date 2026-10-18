-- Role and sharing rules, tested as six pretend people. Runs in one transaction and rolls back.
-- Any failed check raises an error naming it. Run with the Supabase SQL editor or `psql -f`.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bisi@example.test'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test'),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tunde@example.test'),
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"a1","sam":"a2","bisi":"a3","mum":"a4","tunde":"a5","stranger":"a6"}';
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

create function pg_temp.rows(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Ade creates the wedding and becomes its owner; a second tap returns the same wedding.
select pg_temp.act_as('ade');
select set_config('t.wid', public.create_wedding('GBP', '2027-06-26', 'Porto, Portugal', 'Ade & Sam', 5800000, true, 'Ade')::text, true);
do $$ begin
  assert public.create_wedding('GBP', '2027-06-26', 'Porto', null, null, true, 'Ade') = current_setting('t.wid')::uuid, 'double tap makes one wedding';
  assert public.member_role_in(current_setting('t.wid')::uuid) = 'owner', 'Ade is owner';
end $$;

-- Ade fills the five places; a sixth is refused.
select set_config('t.sam', public.invite_member(current_setting('t.wid')::uuid, 'partner', 'Sam', 'SAM@example.test'), true);
select set_config('t.bisi', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Bisi', 'bisi@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
select set_config('t.tunde', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Uncle Tunde', 'tunde@example.test', 'NGN'), true);
select pg_temp.expect_error($$select public.invite_member(current_setting('t.wid')::uuid, 'family', 'Auntie', 'auntie@example.test')$$, 'seat_full', 'third family member refused');
select pg_temp.expect_error($$select public.invite_member(current_setting('t.wid')::uuid, 'partner', 'Extra', 'extra@example.test')$$, 'seat_full', 'third partner refused');
select pg_temp.expect_error($$select public.invite_member(current_setting('t.wid')::uuid, 'owner', 'Extra', 'extra@example.test')$$, 'not_allowed', 'nobody can be invited as owner');
select pg_temp.expect_error($$update public.weddings set unlocked_at = now()$$, '42501', 'owner cannot unlock without paying');

-- An invite link shows a little before sign-in, to anyone holding it.
reset role;
set local role anon;
do $$ begin
  assert (select display_name from public.peek_invite(current_setting('t.sam'))) = 'Sam', 'link shows who it is for';
  assert (select email_hint from public.peek_invite(current_setting('t.sam'))) = 's•••@example.test', 'email is masked';
  assert (select count(*) from public.peek_invite('not-a-real-token')) = 0, 'bad link shows nothing';
end $$;
select pg_temp.expect_error($$select * from public.weddings$$, '42501', 'anonymous visitors see no weddings');
select pg_temp.expect_error($$select * from public.payments$$, '42501', 'anonymous visitors see no payments');
reset role;

-- A link alone gives no access: the stranger can't use Bisi's link.
select pg_temp.act_as('stranger');
select pg_temp.expect_error($$select public.accept_invite(current_setting('t.bisi'))$$, 'invite_email_mismatch', 'link needs the invited email');
do $$ begin
  assert (select count(*) from public.weddings) = 0, 'stranger sees no wedding';
  assert (select count(*) from public.members) = 0, 'stranger sees no people';
end $$;
reset role;

select pg_temp.act_as('sam');   select public.accept_invite(current_setting('t.sam'));   reset role;
select pg_temp.act_as('bisi');  select public.accept_invite(current_setting('t.bisi'));  reset role;
select pg_temp.act_as('mum');   select public.accept_invite(current_setting('t.mum'));   reset role;
select pg_temp.act_as('tunde'); select public.accept_invite(current_setting('t.tunde')); reset role;
select pg_temp.act_as('sam');
select pg_temp.expect_error($$select public.accept_invite(current_setting('t.sam'))$$, 'invite_not_found', 'a used link stops working');
do $$ begin assert (select count(*) from public.weddings) = 1, 'second email can see the wedding'; end $$;
reset role;

-- Ade adds three payments: one Mum covers, one Uncle Tunde covers, one the couple cover.
select pg_temp.act_as('ade');
select set_config('t.mum_id', (select id::text from public.members where display_name = 'Mum'), true);
select set_config('t.tunde_id', (select id::text from public.members where display_name = 'Uncle Tunde'), true);
insert into public.payments (wedding_id, title, amount_minor, currency, paying_member_id) values
  (current_setting('t.wid')::uuid, 'Caterer – deposit', 336000, 'EUR', current_setting('t.mum_id')::uuid),
  (current_setting('t.wid')::uuid, 'Photographer – balance', 175000, 'EUR', current_setting('t.tunde_id')::uuid),
  (current_setting('t.wid')::uuid, 'Venue hire – balance', 1820000, 'EUR', null);
-- Ade records what the venue's contract has in place (the contract check fills this in from stage 5).
select set_config('t.quinta', public.ensure_supplier(current_setting('t.wid')::uuid, 'Quinta do Rio')::text, true);
insert into public.contract_checks (wedding_id, supplier_id, clauses) values (current_setting('t.wid')::uuid, current_setting('t.quinta')::uuid,
  '{"payment_schedule":{"state":"present"},"named_people":{"state":"incomplete"},"supplier_cancels":{"state":"missing"}}');
select pg_temp.expect_error($$insert into public.contract_checks (wedding_id, supplier_id, clauses) values (current_setting('t.wid')::uuid, current_setting('t.quinta')::uuid, '{"named_people":{"state":"maybe"}}')$$, '23514', 'a clause is present, incomplete or missing');
reset role;

-- Mum sees and edits only what she covers.
select pg_temp.act_as('mum');
do $$ begin
  assert (select count(*) from public.payments) = 1, 'Mum sees only her payment';
  assert (select count(*) from public.members) = 1, 'Mum sees only her own place';
  assert pg_temp.rows($q$update public.payments set amount_minor = 340000 where title = 'Caterer – deposit'$q$) = 1, 'Mum can edit her payment';
  assert pg_temp.rows($q$update public.payments set amount_minor = 1 where title = 'Photographer – balance'$q$) = 0, 'Mum cannot edit Uncle Tunde''s payment';
  assert pg_temp.rows($q$update public.payments set amount_minor = 1 where title = 'Venue hire – balance'$q$) = 0, 'Mum cannot edit the couple''s payment';
  assert pg_temp.rows($q$delete from public.payments where title = 'Venue hire – balance'$q$) = 0, 'Mum cannot delete the couple''s payment';
  assert pg_temp.rows($q$update public.weddings set destination = 'Lisbon'$q$) = 0, 'Mum cannot change settings';
  assert (select committed from public.wedding_progress(current_setting('t.wid')::uuid)) > 0, 'Mum sees overall progress';
  assert (select count(*) from public.contract_checks) = 0, 'Mum sees no contract checks';
end $$;
select pg_temp.expect_error($$update public.payments set paying_member_id = current_setting('t.tunde_id')::uuid where title = 'Caterer – deposit'$$, '42501', 'Mum cannot hand her payment to someone else');
select pg_temp.expect_error($$insert into public.payments (wedding_id, title, amount_minor, currency, paying_member_id) values (current_setting('t.wid')::uuid, 'Sneaky', 100, 'EUR', current_setting('t.tunde_id')::uuid)$$, '42501', 'Mum cannot add a payment for someone else');
select pg_temp.expect_error($$insert into public.payments (wedding_id, title, amount_minor, currency) values (current_setting('t.wid')::uuid, 'Sneaky', 100, 'EUR')$$, '42501', 'Mum cannot add a payment the couple cover');
select pg_temp.expect_error($$insert into public.booking_confirmations (wedding_id, supplier_id) values (current_setting('t.wid')::uuid, current_setting('t.quinta')::uuid)$$, '42501', 'Mum cannot record a booking confirmation');
insert into public.payments (wedding_id, title, amount_minor, currency, paying_member_id) values (current_setting('t.wid')::uuid, 'Cake', 40000, 'EUR', current_setting('t.mum_id')::uuid);
select pg_temp.expect_error($$select public.invite_member(current_setting('t.wid')::uuid, 'family', 'Auntie', 'auntie@example.test')$$, 'not_allowed', 'family cannot invite');
reset role;

-- Bisi the planner sees everything except notes (notes arrive in stage 8), can add payments, can't change settings or invite.
select pg_temp.act_as('bisi');
do $$ begin
  assert (select count(*) from public.payments) = 4, 'planner sees every payment';
  assert (select count(*) from public.members) = 5, 'planner sees everyone';
  assert pg_temp.rows($q$update public.weddings set destination = 'Lisbon'$q$) = 0, 'planner cannot change settings';
  assert (select count(*) from public.contract_checks) = 1, 'planner sees contract checks';
end $$;
insert into public.booking_confirmations (wedding_id, supplier_id, language, arrive_at, confirmed_on) values (current_setting('t.wid')::uuid, current_setting('t.quinta')::uuid, 'pt', '13:00', current_date);
insert into public.payments (wedding_id, title, amount_minor, currency) values (current_setting('t.wid')::uuid, 'Florist – deposit', 90000, 'EUR');
select pg_temp.expect_error($$select public.invite_member(current_setting('t.wid')::uuid, 'family', 'Auntie', 'auntie@example.test')$$, 'not_allowed', 'planner cannot invite');
select pg_temp.expect_error($$select public.remove_member(current_setting('t.mum_id')::uuid)$$, 'not_allowed', 'planner cannot remove people');
reset role;

-- Sam, as partner, can change settings and people, but not remove the owner or delete the wedding.
select pg_temp.act_as('sam');
do $$ begin
  assert pg_temp.rows($q$update public.weddings set destination = 'Porto'$q$) = 1, 'partner can change settings';
  assert pg_temp.rows($q$delete from public.weddings$q$) = 0, 'partner cannot delete the wedding';
end $$;
select pg_temp.expect_error($$select public.remove_member((select id from public.members where role = 'owner'))$$, 'not_allowed', 'nobody can remove the owner');
select pg_temp.expect_error($$select public.update_member((select id from public.members where display_name = 'Bisi'), 'owner', 'Bisi')$$, 'not_allowed', 'nobody can be made owner');
select public.remove_member(current_setting('t.mum_id')::uuid);
reset role;

-- Removed people lose access immediately.
select pg_temp.act_as('mum');
do $$ begin
  assert (select count(*) from public.weddings) = 0, 'removed person sees no wedding';
  assert (select count(*) from public.payments) = 0, 'removed person sees no payments';
end $$;
select pg_temp.expect_error($$select * from public.wedding_progress(current_setting('t.wid')::uuid)$$, 'not_allowed', 'removed person sees no progress');
reset role;

-- A stranger with their own wedding can't attach a check to someone else's supplier.
select pg_temp.act_as('stranger');
select set_config('t.other', public.create_wedding('GBP', '2027-09-01', 'Seville, Spain', null, null, true, 'Stranger')::text, true);
select pg_temp.expect_error($$insert into public.contract_checks (wedding_id, supplier_id, clauses) values (current_setting('t.other')::uuid, current_setting('t.quinta')::uuid, '{}')$$, '23503', 'a check must be for a supplier in the same wedding');
do $$ begin assert (select count(*) from public.contract_checks) = 0, 'stranger sees no contract checks'; end $$;
reset role;

-- Only the owner can delete the wedding, and everything goes with it.
select pg_temp.act_as('ade');
do $$ begin assert pg_temp.rows($q$delete from public.weddings$q$) = 1, 'owner can delete the wedding'; end $$;
reset role;
do $$ begin
  assert (select count(*) from public.payments where wedding_id = current_setting('t.wid')::uuid) = 0, 'payments deleted with the wedding';
  assert (select count(*) from public.members where wedding_id = current_setting('t.wid')::uuid) = 0, 'places deleted with the wedding';
  assert (select count(*) from public.contract_checks where wedding_id = current_setting('t.wid')::uuid) = 0, 'contract checks deleted with the wedding';
  assert (select count(*) from public.booking_confirmations where wedding_id = current_setting('t.wid')::uuid) = 0, 'booking confirmations deleted with the wedding';
end $$;

select 'ALL ROLE TESTS PASSED' as result;
rollback;
