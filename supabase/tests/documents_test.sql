-- Documents, the AI allowance and file clean-up. Runs in one transaction and rolls back; ends with
-- ALL DOCUMENT TESTS PASSED. Run with the Supabase SQL editor or `psql -f`.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ade@example.test'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bisi@example.test'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mum@example.test'),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.test');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare ids jsonb := '{"ade":"c1","bisi":"c3","mum":"c4","stranger":"c6"}';
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
select set_config('t.bisi', public.invite_member(current_setting('t.wid')::uuid, 'planner', 'Bisi', 'bisi@example.test'), true);
select set_config('t.mum', public.invite_member(current_setting('t.wid')::uuid, 'family', 'Mum', 'mum@example.test', 'GBP'), true);
reset role;
select pg_temp.act_as('bisi'); select public.accept_invite(current_setting('t.bisi')); reset role;
select pg_temp.act_as('mum'); select public.accept_invite(current_setting('t.mum')); reset role;

-- Ade uploads two documents; their paths must sit in the wedding's own folder.
select pg_temp.act_as('ade');
select set_config('t.d1', gen_random_uuid()::text, true);
select set_config('t.d2', gen_random_uuid()::text, true);
insert into public.documents (id, wedding_id, file_path, file_name, mime, size_bytes) values
  (current_setting('t.d1')::uuid, current_setting('t.wid')::uuid, current_setting('t.wid') || '/' || current_setting('t.d1') || '/fatura.pdf', 'fatura.pdf', 'application/pdf', 120000),
  (current_setting('t.d2')::uuid, current_setting('t.wid')::uuid, current_setting('t.wid') || '/' || current_setting('t.d2') || '/contrato.pdf', 'contrato.pdf', 'application/pdf', 220000);
select pg_temp.expect_error($$insert into public.documents (wedding_id, file_path, file_name, mime, size_bytes) values (current_setting('t.wid')::uuid, '00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/x.pdf', 'x.pdf', 'application/pdf', 10)$$, '23514', 'a file must live in its wedding''s folder');
select pg_temp.expect_error($$insert into public.documents (wedding_id, file_path, file_name, mime, size_bytes) values (current_setting('t.wid')::uuid, 'x', 'virus.exe', 'application/x-msdownload', 10)$$, '23514', 'only PDFs and photos');
do $$ begin
  assert public.can_use_documents(current_setting('t.wid') || '/' || current_setting('t.d1') || '/fatura.pdf'), 'Ade can open the wedding''s files';
  assert public.document_reads_left(current_setting('t.wid')::uuid) = 1, 'free start: one document to read';
end $$;

-- The free start allows one read; a second is refused until the wedding is unlocked.
select set_config('t.u1', public.claim_document_read(current_setting('t.wid')::uuid, current_setting('t.d1')::uuid, 'scan')::text, true);
select pg_temp.expect_error($$select public.claim_document_read(current_setting('t.wid')::uuid, current_setting('t.d2')::uuid, 'contract_check')$$, 'ai_limit', 'second read on the free start refused');
select pg_temp.expect_error($$select public.release_document_read(current_setting('t.u1')::uuid)$$, '42501', 'nobody can give themselves reads back');
do $$ begin assert public.document_reads_left(current_setting('t.wid')::uuid) = 0, 'none left'; end $$;
reset role;

-- The server gives a read back when reading failed on its side.
select public.release_document_read(current_setting('t.u1')::uuid);
update public.weddings set unlocked_at = now() where id = current_setting('t.wid')::uuid; -- as checkout will (stage 9)
select pg_temp.act_as('bisi');
do $$ begin
  assert public.document_reads_left(current_setting('t.wid')::uuid) = 100, 'unlocked: 100 reads';
  assert public.claim_document_read(current_setting('t.wid')::uuid, current_setting('t.d2')::uuid, 'contract_check') is not null, 'the planner can read documents';
  assert (select count(*) from public.documents) = 2, 'the planner sees the documents';
end $$;
-- A contract check can note the seven recommended clauses too, but nothing else.
insert into public.contract_checks (wedding_id, supplier_id, document_id, clauses, red_flags)
values (current_setting('t.wid')::uuid, public.ensure_supplier(current_setting('t.wid')::uuid, 'Quinta do Rio'), current_setting('t.d2')::uuid,
  '{"payment_schedule":{"state":"present","evidence":"30% na reserva"},"named_people":{"state":"incomplete"},"supplier_cancels":{"state":"missing"},"force_majeure":{"state":"missing"}}', '["No refund if the venue cancels"]');
select pg_temp.expect_error($$insert into public.contract_checks (wedding_id, supplier_id, clauses) values (current_setting('t.wid')::uuid, public.ensure_supplier(current_setting('t.wid')::uuid, 'Quinta do Rio'), '{"free_wine":{"state":"present"}}')$$, '23514', 'only the Kit''s clauses');
reset role;

-- Family and strangers see no documents and can't read any.
select pg_temp.act_as('mum');
do $$ begin
  assert (select count(*) from public.documents) = 0, 'family see no documents';
  assert not public.can_use_documents(current_setting('t.wid') || '/' || current_setting('t.d1') || '/fatura.pdf'), 'family can''t open files';
  assert public.document_reads_left(current_setting('t.wid')::uuid) is null, 'family have no allowance';
end $$;
select pg_temp.expect_error($$select public.claim_document_read(current_setting('t.wid')::uuid, current_setting('t.d1')::uuid, 'scan')$$, 'not_allowed', 'family can''t scan');
select pg_temp.expect_error($$insert into public.documents (wedding_id, file_path, file_name, mime, size_bytes) values (current_setting('t.wid')::uuid, current_setting('t.wid') || '/00000000-0000-4000-8000-000000000009/x.pdf', 'x.pdf', 'application/pdf', 10)$$, '42501', 'family can''t upload');
reset role;
select pg_temp.act_as('stranger');
do $$ begin assert not public.can_use_documents(current_setting('t.wid') || '/' || current_setting('t.d1') || '/fatura.pdf'), 'strangers can''t open files'; end $$;
select pg_temp.expect_error($$select public.claim_document_read(current_setting('t.wid')::uuid, current_setting('t.d1')::uuid, 'scan')$$, 'not_allowed', 'strangers can''t scan');
reset role;

-- Deleting a document, or the whole wedding, queues every file for deletion.
select pg_temp.act_as('ade');
do $$ begin
  execute $q$delete from public.documents where id = current_setting('t.d1')::uuid$q$;
  execute $q$delete from public.weddings where id = current_setting('t.wid')::uuid$q$;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.documents where wedding_id = current_setting('t.wid')::uuid) = 0, 'documents deleted with the wedding';
  assert (select count(*) from public.ai_usage where wedding_id = current_setting('t.wid')::uuid) = 0, 'AI use deleted with the wedding';
  assert (select count(*) from public.document_deletions where file_path like current_setting('t.wid') || '/%') = 2, 'both files queued for deletion';
end $$;

select 'ALL DOCUMENT TESTS PASSED' as result;
rollback;
