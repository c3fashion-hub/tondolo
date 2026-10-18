-- Stage 8: notes (typed or dictated with the phone keyboard), reminders, and the AI allowance for
-- voice notes and questions. Only words are stored, never a recording. Notes and reminders are
-- private to the two partners: planners and family never see them.

-- ---------------------------------------------------------------- notes

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  words text not null check (char_length(btrim(words)) between 1 and 4000),
  kind text not null default 'note' check (kind in ('note', 'booking_detail')),
  supplier_id uuid,
  noted_on date not null default current_date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (supplier_id, wedding_id) references public.suppliers (id, wedding_id) on delete set null (supplier_id)
);
create index notes_wedding on public.notes (wedding_id, created_at desc);

alter table public.notes enable row level security;
create policy notes_couple on public.notes for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner'));
revoke all on public.notes from anon, authenticated;
grant select, insert, delete on public.notes to authenticated;
grant update (words, kind, supplier_id) on public.notes to authenticated;

-- ---------------------------------------------------------------- reminders

-- Things the couple asked to be reminded about. They're read out in the weekly briefing.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 300),
  due_on date not null,
  done boolean not null default false,
  done_at timestamptz,
  note_id uuid references public.notes (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reminders_wedding on public.reminders (wedding_id, done, due_on);

alter table public.reminders enable row level security;
create policy reminders_couple on public.reminders for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner'));
revoke all on public.reminders from anon, authenticated;
grant select, insert, delete on public.reminders to authenticated;
grant update (text, due_on, done, done_at) on public.reminders to authenticated;

-- ---------------------------------------------------------------- the AI allowance for notes and questions

-- Voice notes and questions come with Tondolo unlocked. They share their own allowance per wedding,
-- separate from the 100 document reads, so asking questions never uses up scans.
create function public.ai_chats_allowed(w uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when (select unlocked_at from public.weddings where id = w) is null then 0 else 300 end
$$;

-- Takes one use, or refuses: not_allowed (notes are for the couple; questions also for the planner),
-- locked (free start) or ai_limit. Called by the server before asking the AI.
create function public.claim_ai_use(p_wedding uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r text := public.member_role_in(p_wedding);
  used int;
  rid uuid;
begin
  if p_kind not in ('note', 'question') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if r is null or r = 'family' or (p_kind = 'note' and r = 'planner') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if (select unlocked_at from public.weddings where id = p_wedding) is null then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_wedding::text || ':chat'));
  select count(*) into used from public.ai_usage where wedding_id = p_wedding and kind in ('note', 'question');
  if used >= public.ai_chats_allowed(p_wedding) then raise exception 'ai_limit' using errcode = 'P0001'; end if;
  insert into public.ai_usage (wedding_id, member_id, kind)
  values (p_wedding, public.my_member_id(p_wedding), p_kind) returning id into rid;
  return rid;
end $$;

revoke execute on function public.ai_chats_allowed(uuid), public.claim_ai_use(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_use(uuid, text) to authenticated;

-- ---------------------------------------------------------------- what an answer may draw on

-- Everything a question can be answered from, for one wedding, as the person asking sees it:
-- payments with their home-currency value (locked if paid, today's rate if not), budgets, and for
-- the couple only, their reminders and recent notes. Family get nothing.
create function public.wedding_facts(p_wedding uuid, p_today date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r text := public.member_role_in(p_wedding);
  couple boolean := r in ('owner', 'partner');
  w public.weddings;
begin
  if r is null or r = 'family' then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into w from public.weddings where id = p_wedding;
  return jsonb_build_object(
    'today', p_today,
    'names', w.names, 'destination', w.destination, 'wedding_date', w.wedding_date,
    'home_currency', w.home_currency, 'home_digits', (select minor from public.currencies where code = w.home_currency),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', p.title, 'supplier', s.name, 'category', p.category,
        'amount_minor', p.amount_minor, 'currency', p.currency, 'digits', c.minor,
        'status', p.status, 'estimate', p.is_estimate, 'due_on', p.due_on, 'paid_on', p.paid_on,
        'method', p.method, 'paying', payer.display_name,
        'home_minor', case when p.status = 'paid' then
            case when p.locked_home_currency = w.home_currency then p.locked_home_minor
                 else public.convert_minor(p.locked_home_minor, p.locked_home_currency, w.home_currency, p.paid_on) end
          else public.convert_minor(p.amount_minor, p.currency, w.home_currency, p_today) end
      ) order by p.due_on nulls last, p.title)
      from public.payments p
      join public.currencies c on c.code = p.currency
      left join public.suppliers s on s.id = p.supplier_id
      left join public.members payer on payer.id = p.paying_member_id
      where p.wedding_id = p_wedding), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(jsonb_build_object('category', b.category, 'amount_minor', b.amount_minor) order by b.category)
      from public.budgets b where b.wedding_id = p_wedding and b.amount_minor > 0), '[]'::jsonb),
    'reminders', case when couple then coalesce((select jsonb_agg(jsonb_build_object('text', m.text, 'due_on', m.due_on) order by m.due_on)
      from public.reminders m where m.wedding_id = p_wedding and not m.done), '[]'::jsonb) else '[]'::jsonb end,
    'notes', case when couple then coalesce((select jsonb_agg(jsonb_build_object('words', n.words, 'kind', n.kind, 'supplier', s.name, 'noted_on', n.noted_on))
      from (select * from public.notes where wedding_id = p_wedding order by created_at desc limit 40) n
      left join public.suppliers s on s.id = n.supplier_id), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

revoke execute on function public.wedding_facts(uuid, date) from public, anon;
grant execute on function public.wedding_facts(uuid, date) to authenticated;
