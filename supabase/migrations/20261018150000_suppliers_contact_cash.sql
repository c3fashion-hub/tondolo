-- Stage 5: supplier contact details (for booking messages and the claim pack), the language the
-- couple writes to them in, and who hands over each cash payment on the day.

alter table public.suppliers
  add column legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  add column contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  add column phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,24}$'),
  add column email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column language text not null default 'en' check (language in ('en', 'fr', 'pt', 'es'));

grant update (legal_name, contact_name, phone, email, language) on public.suppliers to authenticated;

-- The cash envelope plan: when on the day, and who hands it over.
alter table public.payments
  add column handover_time text check (handover_time is null or handover_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column handover_note text check (handover_note is null or char_length(handover_note) <= 80),
  add column handover_by text check (handover_by is null or char_length(handover_by) <= 80);

grant update (handover_time, handover_note, handover_by) on public.payments to authenticated;
