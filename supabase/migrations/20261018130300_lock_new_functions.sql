-- Functions added in stage 3 are for signed-in people only.
revoke execute on function public.ensure_supplier(uuid, text), public.rate_per_gbp(text, date), public.convert_minor(bigint, text, text, date)
  from public, anon;
