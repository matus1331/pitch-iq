insert into app_config (key, value) values ('invite_code', 'kamosi') on conflict (key) do nothing;

-- Local only: lets the pg_cron sync job reach the local Edge Function (production sets these by hand, see README).
select vault.create_secret('http://supabase_kong_pl-expert:8000', 'project_url');
select vault.create_secret('local-sync-secret', 'sync_secret');
