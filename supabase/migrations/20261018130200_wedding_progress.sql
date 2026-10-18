-- Overall progress for everyone in the wedding, family included: just the two totals in the home
-- currency (committed and paid), never the payments behind them. Same rules as the app: estimates
-- aren't committed, paid amounts use their locked value, the rest today's rate.
create function public.wedding_progress(w uuid) returns table (committed bigint, paid bigint)
language plpgsql stable security definer set search_path = '' as $$
declare home text;
begin
  if public.member_role_in(w) is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select home_currency into home from public.weddings where id = w;
  return query
  with v as (
    select p.status,
      case when p.status = 'paid' then
        case when p.locked_home_currency = home then p.locked_home_minor
             else public.convert_minor(p.locked_home_minor, p.locked_home_currency, home, p.paid_on) end
      else public.convert_minor(p.amount_minor, p.currency, home, current_date) end as home_minor
    from public.payments p where p.wedding_id = w and not p.is_estimate
  )
  select coalesce(sum(home_minor), 0)::bigint, coalesce(sum(home_minor) filter (where status = 'paid'), 0)::bigint from v;
end $$;

revoke execute on function public.wedding_progress(uuid) from public, anon;
grant execute on function public.wedding_progress(uuid) to authenticated;
