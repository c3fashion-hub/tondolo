-- invite_member: rename the local variable that clashed with auth.users.email.
create or replace function public.invite_member(
  p_wedding uuid, p_role public.member_role, p_display_name text, p_email text, p_payer_currency text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_member_id(p_wedding);
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_email text := lower(trim(p_email));
begin
  if public.member_role_in(p_wedding) not in ('owner', 'partner') or me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_role = 'owner' then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.members m join auth.users u on u.id = m.user_id
    where m.wedding_id = p_wedding and m.status = 'active' and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.members (wedding_id, role, status, display_name, invite_email, invite_token_hash, invite_expires_at, payer_currency, invited_by)
  values (p_wedding, p_role, 'invited', left(trim(p_display_name), 60), v_email, public.hash_token(token), now() + interval '14 days',
          case when p_role = 'family' then upper(nullif(p_payer_currency, '')) end, me);
  return token;
end $$;
