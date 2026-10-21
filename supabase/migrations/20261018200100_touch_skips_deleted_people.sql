-- Found by delete_test.sql: deleting an account clears that person from the payments they touched
-- (paying_member_id, created_by, updated_by are set to null). Those clean-ups are updates, and the
-- touch trigger stamped updated_by with the person being deleted, so the deletion failed. Now it
-- only stamps someone whose account still exists; otherwise it keeps what the clean-up set.
create or replace function public.touch_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'payments' and auth.uid() is not null
     and exists (select 1 from auth.users where id = auth.uid()) then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
