-- Stage 4: what each supplier has in place, for protection levels and the money health check.
-- Contract checks hold the Protection Kit's three must-haves; booking confirmations hold the
-- six-point message and the supplier's reply. Filled in by the contract check and booking
-- builder (stages 5 and 6); the couple and planner see them, family never do.

-- A check or confirmation must point at a supplier in the same wedding.
alter table public.suppliers add constraint suppliers_id_wedding unique (id, wedding_id);

-- Each must-have is present, incomplete or missing, with optional evidence (the words found).
create function public.valid_clauses(c jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'object'
    and not exists (
      select 1 from jsonb_each(c) e
      where e.key not in ('payment_schedule', 'named_people', 'supplier_cancels')
         or jsonb_typeof(e.value) <> 'object'
         or coalesce(e.value ->> 'state', '') not in ('present', 'incomplete', 'missing')
         or char_length(coalesce(e.value ->> 'evidence', '')) > 1000
    )
$$;

create table public.contract_checks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  supplier_id uuid not null,
  document_id uuid, -- the contract it was read from (documents arrive in stage 5)
  clauses jsonb not null check (public.valid_clauses(clauses)),
  red_flags jsonb not null default '[]' check (jsonb_typeof(red_flags) = 'array'),
  checked_by uuid default auth.uid() references auth.users (id) on delete set null,
  checked_at timestamptz not null default now(),
  foreign key (supplier_id, wedding_id) references public.suppliers (id, wedding_id) on delete cascade
);
create index contract_checks_supplier on public.contract_checks (supplier_id, checked_at desc);

create table public.booking_confirmations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  supplier_id uuid not null,
  points jsonb not null default '{}' check (jsonb_typeof(points) = 'object'), -- the six points as sent
  language text not null default 'en' check (language in ('en', 'fr', 'pt', 'es')),
  arrive_at text check (arrive_at is null or arrive_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sent_on date,
  confirmed_on date,
  reply_evidence text check (reply_evidence is null or char_length(reply_evidence) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (supplier_id, wedding_id) references public.suppliers (id, wedding_id) on delete cascade
);
create index booking_confirmations_supplier on public.booking_confirmations (supplier_id);

alter table public.contract_checks enable row level security;
alter table public.booking_confirmations enable row level security;

create policy contract_checks_all on public.contract_checks for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));
create policy booking_confirmations_all on public.booking_confirmations for all to authenticated
  using (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'))
  with check (public.member_role_in(wedding_id) in ('owner', 'partner', 'planner'));

revoke all on public.contract_checks, public.booking_confirmations from anon, authenticated;
grant select, insert, delete on public.contract_checks, public.booking_confirmations to authenticated;
grant update (clauses, red_flags, document_id) on public.contract_checks to authenticated;
grant update (points, language, arrive_at, sent_on, confirmed_on, reply_evidence) on public.booking_confirmations to authenticated;
revoke execute on function public.valid_clauses(jsonb) from public, anon;
grant execute on function public.valid_clauses(jsonb) to authenticated;
