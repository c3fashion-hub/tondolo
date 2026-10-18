-- "Deleting a wedding removes every trace" (spec, testing checklist). Run in the Supabase SQL
-- editor: it rolls back and ends with ALL DELETE TESTS PASSED.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'magali@example.test'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"a1","sam":"a2","magali":"a3","mum":"a4"}';
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

-- Magali also plans another wedding, so her account must survive.
select pg_temp.act_as('magali');
select set_config('t.other', public.create_wedding('EUR', '2027-09-04', 'Lisbon, Portugal', 'Joy & Kemi', null, false, 'Magali')::text, true);
reset role;

select pg_temp.act_as('ade');
select set_config('t.wid', public.create_wedding('GBP', '2027-06-26', 'Porto, Portugal', 'Ade & Sam', 5800000, true, 'Ade')::text, true);
select set_config('t.sam', public.invite_member(current_setting('t.wid')::uuid, 'partner', 'Sam', 'sam@example.test'), true);
select set_config('t.magali', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Magali', 'magali@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
reset role;
select pg_temp.act_as('sam'); select public.accept_invite(current_setting('t.sam')); reset role;
select pg_temp.act_as('magali'); select public.accept_invite(current_setting('t.magali')); reset role;
select pg_temp.act_as('mum'); select public.accept_invite(current_setting('t.mum')); reset role;

-- Something in every table.
select pg_temp.act_as('ade');
select set_config('t.sup', public.ensure_supplier(current_setting('t.wid')::uuid, 'Quinta do Rio')::text, true);
insert into public.payments (wedding_id, title, amount_minor, currency, due_on, supplier_id, paying_member_id)
values (current_setting('t.wid')::uuid, 'Venue – deposit', 780000, 'EUR', '2026-11-01', current_setting('t.sup')::uuid,
  (select id from public.members where display_name = 'Mum' and wedding_id = current_setting('t.wid')::uuid));
insert into public.notes (wedding_id, words) values (current_setting('t.wid')::uuid, 'Terrace if dry');
insert into public.reminders (wedding_id, text, due_on) values (current_setting('t.wid')::uuid, 'Confirm the terrace', '2026-10-21');
insert into public.checkins (wedding_id) values (current_setting('t.wid')::uuid);
select set_config('t.doc', gen_random_uuid()::text, true);
insert into public.documents (id, wedding_id, file_path, file_name, mime, size_bytes)
values (current_setting('t.doc')::uuid, current_setting('t.wid')::uuid, current_setting('t.wid') || '/' || current_setting('t.doc') || '/fatura.pdf', 'fatura.pdf', 'application/pdf', 1000);
reset role;
insert into public.purchases (wedding_id, stripe_session_id, currency, amount_minor) values (current_setting('t.wid')::uuid, 'cs_test_del1', 'GBP', 4900);
insert into public.ai_usage (wedding_id, kind) values (current_setting('t.wid')::uuid, 'question');

-- Only the owner, and only after typing "delete".
select pg_temp.act_as('sam');
select pg_temp.expect_error($$select public.delete_wedding(current_setting('t.wid')::uuid, 'delete')$$, 'not_owner', 'a partner can''t delete the wedding');
reset role;
select pg_temp.act_as('ade');
select pg_temp.expect_error($$select public.delete_wedding(current_setting('t.wid')::uuid, 'yes')$$, 'not_confirmed', 'it needs the word delete');
select pg_temp.expect_error($$select public.delete_my_account('delete')$$, 'owner_of_wedding', 'an owner deletes the wedding first');
reset role;

-- Mum deletes her own account; her payment stays with the couple.
select pg_temp.act_as('mum');
select public.delete_my_account('delete');
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a4'), 'Mum''s account is gone';
  assert (select paying_member_id is null from public.payments where wedding_id = current_setting('t.wid')::uuid), 'her payment stays, unassigned';
end $$;

-- Ade deletes everything.
select pg_temp.act_as('ade');
select set_config('t.gone', public.delete_wedding(current_setting('t.wid')::uuid, ' Delete ')::text, true);
reset role;

do $$
declare w uuid := current_setting('t.wid')::uuid;
begin
  assert current_setting('t.gone') = '2', 'two accounts deleted (Ade and Sam)';
  assert not exists (select 1 from public.weddings where id = w), 'wedding';
  assert not exists (select 1 from public.members where wedding_id = w), 'members';
  assert not exists (select 1 from public.payments where wedding_id = w), 'payments';
  assert not exists (select 1 from public.suppliers where wedding_id = w), 'suppliers';
  assert not exists (select 1 from public.budgets where wedding_id = w), 'budgets';
  assert not exists (select 1 from public.notes where wedding_id = w), 'notes';
  assert not exists (select 1 from public.reminders where wedding_id = w), 'reminders';
  assert not exists (select 1 from public.checkins where wedding_id = w), 'check-in';
  assert not exists (select 1 from public.documents where wedding_id = w), 'documents';
  assert not exists (select 1 from public.contract_checks where wedding_id = w), 'contract checks';
  assert not exists (select 1 from public.booking_confirmations where wedding_id = w), 'booking confirmations';
  assert not exists (select 1 from public.ai_usage where wedding_id = w), 'AI usage';
  assert not exists (select 1 from public.alert_log where wedding_id = w), 'email log';
  assert not exists (select 1 from public.purchases where wedding_id = w), 'purchases';
  assert exists (select 1 from public.document_deletions where file_path like w::text || '/%'), 'the file is queued for the purge';
  assert not exists (select 1 from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')), 'Ade and Sam''s accounts';
  assert exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a3'), 'Magali stays: she has another wedding';
  assert exists (select 1 from public.weddings where id = current_setting('t.other')::uuid), 'the other wedding is untouched';
end $$;

select 'ALL DELETE TESTS PASSED' as result;
rollback;
