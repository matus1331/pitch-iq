create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Needs two Vault secrets (see README): project_url, sync_secret.
select cron.schedule(
  'fpl-sync',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
