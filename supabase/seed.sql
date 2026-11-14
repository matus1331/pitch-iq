insert into app_config (key, value) values ('invite_code', 'kamosi') on conflict (key) do nothing;
