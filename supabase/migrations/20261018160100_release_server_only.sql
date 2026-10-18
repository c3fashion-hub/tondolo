-- Giving back a document read is server-only (the read-document function's service role), so
-- nobody can refund their own successful scans. Repeats what 160000 now says, for databases
-- that ran its first version.
create or replace function public.release_document_read(p_usage uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_usage where id = p_usage and created_at > now() - interval '10 minutes'
$$;
revoke execute on function public.release_document_read(uuid) from public, anon, authenticated;
