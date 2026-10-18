-- Stage 6: uploaded documents, reading them with AI, and the AI allowance per wedding.
-- Files live in a private storage bucket, one folder per wedding. Nothing the AI suggests is
-- saved anywhere until a person confirms it in the app.

-- ---------------------------------------------------------------- documents

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  supplier_id uuid,
  kind text check (kind is null or kind in ('quote', 'contract', 'invoice', 'receipt', 'other')),
  file_path text not null unique check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]{1,140}$'),
  file_name text not null check (char_length(file_name) between 1 and 140),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 15000000),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (supplier_id, wedding_id) references public.suppliers (id, wedding_id) on delete set null (supplier_id),
  check (split_part(file_path, '/', 1) = wedding_id::text and split_part(file_path, '/', 2) = id::text)
);
create index documents_wedding on public.documents (wedding_id, created_at desc);
create index documents_supplier on public.documents (supplier_id);

alter table public.payments add column document_id uuid references public.documents (id) on delete set null;
grant update (document_id) on public.payments to authenticated;
alter table public.contract_checks add constraint contract_checks_document
  foreign key (document_id) references public.documents (id) on delete set null;

-- A contract check now also notes the Kit's seven recommended clauses (present or missing).
create or replace function public.valid_clauses(c jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'object'
    and not exists (
      select 1 from jsonb_each(c) e
      where e.key not in ('payment_schedule', 'named_people', 'supplier_cancels',
                          'who', 'what', 'price_currency', 'you_cancel', 'force_majeure', 'third_parties', 'changes_language')
         or jsonb_typeof(e.value) <> 'object'
         or coalesce(e.value ->> 'state', '') not in ('present', 'incomplete', 'missing')
         or char_length(coalesce(e.value ->> 'evidence', '')) > 1000
    )
$$;

alter table public.documents enable row level security;

-- The couple and planner work with documents; family don't see them (they hold names, addresses and bank details).
create policy documents_all on public.documents for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));

revoke all on public.documents from anon, authenticated;
grant select, insert, delete on public.documents to authenticated;
grant update (supplier_id, kind, confirmed_by, confirmed_at) on public.documents to authenticated;

-- ---------------------------------------------------------------- the files themselves

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15000000, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Paths are <wedding id>/<document id>/<file name>; the first folder decides who may touch the file.
create function public.can_use_documents(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((storage.foldername(path))[1] ~ '^[0-9a-f-]{36}$'
     and public.member_role_in(((storage.foldername(path))[1])::uuid) in ('owner', 'partner', 'planner'), false)
$$;
revoke execute on function public.can_use_documents(text) from public, anon;
grant execute on function public.can_use_documents(text) to authenticated;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_use_documents(name));
create policy documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_use_documents(name));
create policy documents_remove on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_use_documents(name));

-- When a document row goes (on its own, or with its wedding), its file is queued for deletion.
-- Storage files can't be removed from SQL, so the purge-documents function empties the queue hourly.
create table public.document_deletions (
  file_path text primary key,
  queued_at timestamptz not null default now()
);
alter table public.document_deletions enable row level security; -- no policies: only the server's purge job reads it
revoke all on public.document_deletions from anon, authenticated;

create function public.queue_document_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.document_deletions (file_path) values (old.file_path) on conflict do nothing;
  return old;
end $$;
create trigger documents_queue_file after delete on public.documents
for each row execute function public.queue_document_file();
revoke execute on function public.queue_document_file() from public, anon, authenticated;

-- ---------------------------------------------------------------- the AI allowance

-- One row per document read (a scan or a contract check), voice note or question.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  kind text not null check (kind in ('scan', 'contract_check', 'note', 'question')),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_usage_wedding on public.ai_usage (wedding_id, kind);
alter table public.ai_usage enable row level security;
create policy ai_usage_read on public.ai_usage for select to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Free start: 1 document read. After unlocking: 100 per wedding. Scans and contract checks share it.
create function public.document_reads_allowed(w uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when (select unlocked_at from public.weddings where id = w) is null then 1 else 100 end
$$;

-- Takes one read from the allowance, or refuses with ai_limit. Called by the server before reading.
create function public.claim_document_read(p_wedding uuid, p_document uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  rid uuid;
begin
  if public.member_role_in(p_wedding) not in ('owner', 'partner', 'planner') or public.member_role_in(p_wedding) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_kind not in ('scan', 'contract_check') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.documents where id = p_document and wedding_id = p_wedding) then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_wedding::text)); -- two reads at once can't both take the last one
  select count(*) into used from public.ai_usage where wedding_id = p_wedding and kind in ('scan', 'contract_check');
  if used >= public.document_reads_allowed(p_wedding) then
    raise exception 'ai_limit' using errcode = 'P0001';
  end if;
  insert into public.ai_usage (wedding_id, member_id, kind, document_id)
  values (p_wedding, public.my_member_id(p_wedding), p_kind, p_document) returning id into rid;
  return rid;
end $$;

-- Gives a read back when reading failed on our side, so a failed scan never uses up the allowance.
-- Only the server's read-document function calls it (service role), never the app.
create function public.release_document_read(p_usage uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_usage where id = p_usage and created_at > now() - interval '10 minutes'
$$;

create function public.document_reads_left(w uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when public.member_role_in(w) in ('owner', 'partner', 'planner') then
    greatest(0, public.document_reads_allowed(w) - (select count(*)::int from public.ai_usage where wedding_id = w and kind in ('scan', 'contract_check')))
  end
$$;

revoke execute on function public.document_reads_allowed(uuid), public.claim_document_read(uuid, uuid, text),
  public.release_document_read(uuid), public.document_reads_left(uuid) from public, anon;
revoke execute on function public.release_document_read(uuid) from authenticated;
grant execute on function public.claim_document_read(uuid, uuid, text), public.document_reads_left(uuid) to authenticated;
