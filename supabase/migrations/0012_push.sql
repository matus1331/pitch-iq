-- Web push: one row per device (browser endpoint). The sync function sends the notifications.
create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy read_own on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy delete_own on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Saving goes through an RPC: a device that was used by another account takes over its endpoint.
create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'PUSH_INVALID' using errcode = 'P0001';
  end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
revoke execute on function save_push_subscription(text, text, text) from public, anon;

-- Which round notifications went out already (kind: 'reminder' | 'results'). Server only.
create table notifications_sent (
  gameweek_id int not null references gameweeks,
  kind text not null check (kind in ('reminder', 'results')),
  sent_at timestamptz not null default now(),
  primary key (gameweek_id, kind)
);
alter table notifications_sent enable row level security;  -- no policies: invisible to clients

-- Rounds that are already over must not announce their results on the first run.
insert into notifications_sent (gameweek_id, kind)
select g.id, 'results' from gameweeks g
where exists (select 1 from fixtures f where f.gameweek_id = g.id)
  and not exists (select 1 from fixtures f where f.gameweek_id = g.id and not f.finished);
