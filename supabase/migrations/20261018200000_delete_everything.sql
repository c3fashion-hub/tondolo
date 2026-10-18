-- Stage 10: "Delete everything" (spec, Data and privacy): the owner can delete the whole wedding and
-- every account on it in one step; anyone can delete their own account. Deleting a wedding removes
-- every row that belongs to it (all tables cascade from weddings), queues its uploaded files for the
-- hourly purge, and deletes the accounts of its people unless they belong to another wedding.

create function public.delete_wedding(p_wedding uuid, p_confirm text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  people uuid[];
  gone integer;
begin
  if public.member_role_in(p_wedding) is distinct from 'owner' then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> 'delete' then
    raise exception 'not_confirmed' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct user_id), '{}') into people
  from public.members where wedding_id = p_wedding and user_id is not null;

  delete from public.weddings where id = p_wedding;

  -- Accounts that now belong to no wedding at all.
  with removed as (
    delete from auth.users u
    where u.id = any(people)
      and not exists (select 1 from public.members m where m.user_id = u.id)
    returning 1
  )
  select count(*) into gone from removed;
  return gone;
end $$;

-- Anyone but an owner can delete their own account; their payments stay with the couple.
-- An owner deletes the wedding first (with delete_wedding), which deletes their account too.
create function public.delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> 'delete' then
    raise exception 'not_confirmed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid() and role = 'owner' and status <> 'removed') then
    raise exception 'owner_of_wedding' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_wedding(uuid, text), public.delete_my_account(text) from public, anon;
grant execute on function public.delete_wedding(uuid, text), public.delete_my_account(text) to authenticated;
