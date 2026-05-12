
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('clear-commissions-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clear-commissions-daily');

SELECT cron.schedule(
  'clear-commissions-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--adf98041-e9e9-4e80-8720-23e8691d5ec1.lovable.app/api/public/hooks/clear-commissions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbGNudG1kb2tneGpua2dvcG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODk2NzIsImV4cCI6MjA5NDE2NTY3Mn0.KkYgU_PqiIfjhfiB7KkvNPzFMNDYQ2qfXNep1_J60lA'
    ),
    body := '{}'::jsonb
  );
  $$
);
