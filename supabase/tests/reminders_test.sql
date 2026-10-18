-- Which reminders and summaries the daily job sends. Runs in one transaction and rolls back; ends
-- with ALL REMINDER TESTS PASSED. Today is fixed as Sunday 18 October 2026.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'magali@example.test'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"d1","magali":"d3","mum":"d4"}';
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
select set_config('t.magali', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Magali', 'magali@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
reset role;
select pg_temp.act_as('magali'); select public.accept_invite(current_setting('t.magali')); reset role;
select pg_temp.act_as('mum'); select public.accept_invite(current_setting('t.mum')); reset role;

select pg_temp.act_as('ade');
select set_config('t.mum_id', (select id::text from public.members where display_name = 'Mum'), true);
insert into public.payments (wedding_id, title, amount_minor, currency, due_on, paying_member_id) values
  (current_setting('t.wid')::uuid, 'Caterer – deposit', 336000, 'GBP', '2026-10-21', current_setting('t.mum_id')::uuid), -- 3 days
  (current_setting('t.wid')::uuid, 'Planner – second payment', 240000, 'GBP', '2026-10-28', null),                         -- 10 days
  (current_setting('t.wid')::uuid, 'Venue – balance', 1820000, 'GBP', '2026-11-20', null),                                  -- 33 days
  (current_setting('t.wid')::uuid, 'Florist – deposit', 90000, 'GBP', '2026-10-10', null);                                  -- overdue
insert into public.payments (wedding_id, title, amount_minor, currency, due_on, is_estimate, due_offset_days) values
  (current_setting('t.wid')::uuid, 'DJ (estimate)', 42000, 'GBP', '2026-10-20', true, 250);                                -- estimates: no reminder
do $$ begin
  assert (select email_reminders from public.members where display_name = 'Ade'), 'the owner gets reminders by default';
  assert (select not email_reminders from public.members where display_name = 'Magali'), 'the planner chooses';
end $$;
select pg_temp.expect_error($$select public.reminders_to_send('2026-10-18')$$, '42501', 'only the server can list reminders');
reset role;

select pg_temp.act_as('mum');
select pg_temp.expect_error($$select public.set_my_emails(current_setting('t.wid')::uuid, true, false)$$, 'family_emails_off', 'family emails stay off for now');
reset role;
select pg_temp.act_as('magali');
select public.set_my_emails(current_setting('t.wid')::uuid, true, true);
reset role;

do $$ declare r record; begin
  assert (select count(*) from public.reminders_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid) = 4,
    'two payments each for Ade and Magali (3 and 10 days); nothing 33 days out, overdue or estimated';
  select * into r from public.reminders_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid and title = 'Caterer – deposit' limit 1;
  assert r.kind = 'due_3' and r.days_left = 3 and r.payer_name = 'Mum', 'the caterer is the 3-day reminder, Mum paying';
  assert (select kind from public.reminders_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid and title like 'Planner%' limit 1) = 'due_14', 'the planner payment is the 14-day reminder';
  assert not exists (select 1 from public.reminders_to_send('2026-10-18') where display_name = 'Mum'), 'no emails to family';
  -- Once sent and logged, they don't go again.
  insert into public.alert_log (wedding_id, member_id, payment_id, kind, sent_for)
  select wedding_id, member_id, payment_id, kind, due_on from public.reminders_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid;
  assert (select count(*) from public.reminders_to_send('2026-10-19') where wedding_id = current_setting('t.wid')::uuid) = 0, 'nothing twice the next day';
  -- The planner payment reaches 3 days on 25 October and gets its second reminder.
  assert (select count(*) from public.reminders_to_send('2026-10-25') where wedding_id = current_setting('t.wid')::uuid and kind = 'due_3') = 2, 'the 3-day reminder follows';
  -- Sunday is the default check-in day: only Magali asked for the summary.
  assert (select count(*) from public.summaries_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid) = 1, 'one weekly summary, for Magali';
  assert (select jsonb_array_length(due_soon) from public.summaries_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid) = 2, 'two due in the next fortnight';
  assert (select jsonb_array_length(overdue) from public.summaries_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid) = 1, 'one overdue';
  assert (select committed from public.summaries_to_send('2026-10-18') where wedding_id = current_setting('t.wid')::uuid) = 2486000, 'totals leave out the estimate';
  assert (select count(*) from public.summaries_to_send('2026-10-19') where wedding_id = current_setting('t.wid')::uuid) = 0, 'not on Monday';
end $$;

-- A Wednesday check-in moves the summary to Wednesdays; only the couple can set it.
select pg_temp.act_as('magali');
select pg_temp.expect_error($$insert into public.checkins (wedding_id, day) values (current_setting('t.wid')::uuid, 3)$$, '42501', 'the planner can''t set the check-in');
reset role;
select pg_temp.act_as('ade');
insert into public.checkins (wedding_id, day, at_time, second_day) values (current_setting('t.wid')::uuid, 3, '19:30', 7);
select pg_temp.expect_error($$update public.checkins set second_day = 3 where wedding_id = current_setting('t.wid')::uuid$$, '23514', 'two different days');
reset role;
do $$ begin
  assert (select count(*) from public.summaries_to_send('2026-10-21') where wedding_id = current_setting('t.wid')::uuid) = 1, 'summary on Wednesday';
  assert (select checkin_time from public.summaries_to_send('2026-10-21') where wedding_id = current_setting('t.wid')::uuid) = '19:30', 'with the check-in time';
end $$;

select 'ALL REMINDER TESTS PASSED' as result;
rollback;
