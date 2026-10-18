-- Notes, reminders, the AI allowance for voice notes and questions, and what answers draw on.
-- Runs in one transaction and rolls back; ends with ALL NOTE TESTS PASSED.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'magali@example.test'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test'),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"e1","sam":"e2","magali":"e3","mum":"e4","stranger":"e5"}';
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
select set_config('t.magali', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Magali', 'magali@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
reset role;
select pg_temp.act_as('sam'); select public.accept_invite(current_setting('t.sam')); reset role;
select pg_temp.act_as('magali'); select public.accept_invite(current_setting('t.magali')); reset role;
select pg_temp.act_as('mum'); select public.accept_invite(current_setting('t.mum')); reset role;

-- The couple write notes and reminders.
select pg_temp.act_as('ade');
select set_config('t.quinta', public.ensure_supplier(current_setting('t.wid')::uuid, 'Quinta do Rio')::text, true);
insert into public.payments (wedding_id, title, amount_minor, currency, due_on, supplier_id) values
  (current_setting('t.wid')::uuid, 'Venue – balance', 1820000, 'GBP', '2027-05-26', current_setting('t.quinta')::uuid);
insert into public.notes (wedding_id, words, supplier_id) values
  (current_setting('t.wid')::uuid, 'Ceremony on the terrace if it''s dry, the lawn if not.', current_setting('t.quinta')::uuid);
insert into public.notes (wedding_id, words, kind) values (current_setting('t.wid')::uuid, 'Photographer arrives at 13:00', 'booking_detail');
insert into public.reminders (wedding_id, text, due_on) values (current_setting('t.wid')::uuid, 'Confirm the terrace or the lawn with the Quinta', '2026-10-21');
select pg_temp.expect_error($$insert into public.notes (wedding_id, words) values (current_setting('t.wid')::uuid, '   ')$$, '23514', 'a note has words');
select pg_temp.expect_error($$insert into public.notes (wedding_id, words, kind) values (current_setting('t.wid')::uuid, 'x', 'audio')$$, '23514', 'notes are words only');
reset role;

select pg_temp.act_as('sam');
do $$ begin
  assert (select count(*) from public.notes) = 2, 'the other partner sees both notes';
  assert (select count(*) from public.reminders) = 1, 'and the reminder';
end $$;
update public.reminders set done = true, done_at = now() where wedding_id = current_setting('t.wid')::uuid;
update public.reminders set done = false, done_at = null where wedding_id = current_setting('t.wid')::uuid;
reset role;

-- Notes are private to the two partners.
select pg_temp.act_as('magali');
do $$ begin
  assert (select count(*) from public.notes) = 0, 'the planner sees no notes';
  assert (select count(*) from public.reminders) = 0, 'the planner sees no reminders';
end $$;
select pg_temp.expect_error($$insert into public.notes (wedding_id, words) values (current_setting('t.wid')::uuid, 'hello')$$, '42501', 'the planner can''t add notes');
update public.notes set words = 'changed' where wedding_id = current_setting('t.wid')::uuid;
delete from public.notes where wedding_id = current_setting('t.wid')::uuid;
reset role;
select pg_temp.act_as('mum');
do $$ begin assert (select count(*) from public.notes) = 0 and (select count(*) from public.reminders) = 0, 'family see no notes or reminders'; end $$;
select pg_temp.expect_error($$insert into public.reminders (wedding_id, text, due_on) values (current_setting('t.wid')::uuid, 'x', '2026-11-01')$$, '42501', 'family can''t add reminders');
reset role;
select pg_temp.act_as('stranger');
do $$ begin assert (select count(*) from public.notes) = 0, 'strangers see nothing'; end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notes where wedding_id = current_setting('t.wid')::uuid and words <> 'changed') = 2, 'the planner changed and deleted nothing';
end $$;

-- The allowance: voice notes and questions come with Tondolo unlocked.
select pg_temp.act_as('ade');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'note')$$, 'locked', 'not on the free start');
reset role;
update public.weddings set unlocked_at = now() where id = current_setting('t.wid')::uuid;

select pg_temp.act_as('ade');
select public.claim_ai_use(current_setting('t.wid')::uuid, 'note');
select public.claim_ai_use(current_setting('t.wid')::uuid, 'question');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'scan')$$, 'bad_kind', 'scans use their own allowance');
select pg_temp.expect_error($$select public.ai_chats_allowed(current_setting('t.wid')::uuid)$$, '42501', 'the allowance size is internal');
reset role;
select pg_temp.act_as('magali');
select public.claim_ai_use(current_setting('t.wid')::uuid, 'question');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'note')$$, 'not_allowed', 'the planner has no notes');
reset role;
select pg_temp.act_as('mum');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'question')$$, 'not_allowed', 'family can''t ask');
reset role;
select pg_temp.act_as('stranger');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'question')$$, 'not_allowed', 'strangers can''t ask');
reset role;
do $$ begin
  assert (select count(*) from public.ai_usage where wedding_id = current_setting('t.wid')::uuid and kind in ('note', 'question')) = 3, 'three uses recorded';
end $$;
-- The 300th use is the last.
insert into public.ai_usage (wedding_id, kind) select current_setting('t.wid')::uuid, 'question' from generate_series(1, 296);
select pg_temp.act_as('sam');
select public.claim_ai_use(current_setting('t.wid')::uuid, 'note');
select pg_temp.expect_error($$select public.claim_ai_use(current_setting('t.wid')::uuid, 'note')$$, 'ai_limit', 'polite stop at the cap');
reset role;

-- What answers draw on: the couple's facts include notes and reminders; the planner's don't.
select pg_temp.act_as('ade');
do $$ declare f jsonb := public.wedding_facts(current_setting('t.wid')::uuid, '2026-10-18'); begin
  assert jsonb_array_length(f -> 'payments') = 1 and (f -> 'payments' -> 0 ->> 'home_minor')::bigint = 1820000, 'payments with home values';
  assert (f -> 'payments' -> 0 ->> 'supplier') = 'Quinta do Rio', 'with the supplier';
  assert jsonb_array_length(f -> 'notes') = 2 and jsonb_array_length(f -> 'reminders') = 1, 'the couple''s notes and reminders';
end $$;
reset role;
select pg_temp.act_as('magali');
do $$ declare f jsonb := public.wedding_facts(current_setting('t.wid')::uuid, '2026-10-18'); begin
  assert jsonb_array_length(f -> 'payments') = 1, 'the planner''s answers see payments';
  assert jsonb_array_length(f -> 'notes') = 0 and jsonb_array_length(f -> 'reminders') = 0, 'but never the couple''s notes';
end $$;
reset role;
select pg_temp.act_as('mum');
select pg_temp.expect_error($$select public.wedding_facts(current_setting('t.wid')::uuid)$$, 'not_allowed', 'family get no facts');
reset role;
select pg_temp.act_as('stranger');
select pg_temp.expect_error($$select public.wedding_facts(current_setting('t.wid')::uuid)$$, 'not_allowed', 'strangers get no facts');
reset role;

select 'ALL NOTE TESTS PASSED' as result;
rollback;
