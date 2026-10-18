-- Sends due-date reminders and weekly summaries every morning at 06:45 UTC (07:45 in British summer time).
-- The bearer is the project's public anon key, which only lets the call through Supabase's gateway;
-- the function itself writes with its own server-side key.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'send-reminders',
  '45 6 * * *',
  $$
  select net.http_post(
    url := 'https://znxpxkbmgcztswupnaez.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpueHB4a2JtZ2N6dHN3dXBuYWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNzMzMDIsImV4cCI6MjEwNzg0OTMwMn0.xFaXCEwN-KgKBy88YJmVQ13xnCuyKfUYBUIgx1vxKW8'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
