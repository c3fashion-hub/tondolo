-- Internal helpers (triggers and hashing) are never called from the app.
revoke execute on function public.check_paying_member(), public.enforce_seats(), public.touch_updated_at(), public.hash_token(text)
  from authenticated, anon, public;
