-- The same-wedding check must see every place in the wedding, not only those the caller may see,
-- so that role rules (not a misleading "not in wedding" error) decide what family can do.
create or replace function public.check_paying_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.paying_member_id is not null and not exists (
    select 1 from public.members where id = new.paying_member_id and wedding_id = new.wedding_id
  ) then
    raise exception 'paying_member_not_in_wedding' using errcode = 'P0001';
  end if;
  return new;
end $$;
