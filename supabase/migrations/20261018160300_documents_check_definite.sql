-- can_use_documents answers a definite no (not "unknown") for people outside the wedding.
-- Repeats what 160000 now says, for databases that ran its first version.
create or replace function public.can_use_documents(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((storage.foldername(path))[1] ~ '^[0-9a-f-]{36}$'
     and public.member_role_in(((storage.foldername(path))[1])::uuid) in ('owner', 'partner', 'planner'), false)
$$;
