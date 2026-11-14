-- Client-facing rules. Triggers only police the `authenticated` role;
-- the sync function (service_role) and admins (postgres) bypass them.

create function is_client() returns boolean language sql stable as $$
  select coalesce(auth.role(), '') = 'authenticated'
$$;

create function assert_open(p_fixture int) returns void language plpgsql stable as $$
declare k timestamptz;
begin
  select kickoff_time into k from fixtures where id = p_fixture;
  if k is null or k <= now() then
    raise exception 'TIP_LOCKED' using errcode = 'P0001';
  end if;
end $$;

create function match_tips_guard() returns trigger language plpgsql as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open(old.fixture_id); return old; end if;
  perform assert_open(new.fixture_id);
  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

create trigger match_tips_guard before insert or update or delete on match_tips
for each row execute function match_tips_guard();

create function club_tips_guard() returns trigger language plpgsql as $$
declare
  my_club int;
  offer club_tip_offers;
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open(old.fixture_id); return old; end if;
  perform assert_open(new.fixture_id);

  select club_team_id into my_club from profiles where id = new.user_id;
  if my_club is null or not exists (
    select 1 from fixtures where id = new.fixture_id and my_club in (team_h, team_a)
  ) then
    raise exception 'CLUB_TIP_WRONG_FIXTURE' using errcode = 'P0001';
  end if;

  select * into offer from club_tip_offers where fixture_id = new.fixture_id and team_id = my_club;
  if offer is null or offer.voided or not (new.tip_key = any (offer.tip_keys)) then
    raise exception 'CLUB_TIP_NOT_OFFERED' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from club_tips where user_id = new.user_id and fixture_id = new.fixture_id) >= 3 then
      raise exception 'CLUB_TIP_LIMIT' using errcode = 'P0001';
    end if;
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

create trigger club_tips_guard before insert or update or delete on club_tips
for each row execute function club_tips_guard();

create function profiles_club_lock() returns trigger language plpgsql as $$
begin
  if old.club_team_id is not null and new.club_team_id is distinct from old.club_team_id
     and coalesce(current_setting('app.admin', true), '') <> 'on' then
    raise exception 'CLUB_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Admin club change: `set local app.admin = 'on'; update profiles set club_team_id = ...;`
create trigger profiles_club_lock before update on profiles
for each row execute function profiles_club_lock();

-- RLS
alter table app_config enable row level security;  -- no policies: invisible to clients
alter table teams enable row level security;
alter table players enable row level security;
alter table gameweeks enable row level security;
alter table fixtures enable row level security;
alter table player_match_stats enable row level security;
alter table club_tip_offers enable row level security;
alter table profiles enable row level security;
alter table match_tips enable row level security;
alter table club_tips enable row level security;

create policy read_all on teams for select to authenticated using (true);
create policy read_all on players for select to authenticated using (true);
create policy read_all on gameweeks for select to authenticated using (true);
create policy read_all on fixtures for select to authenticated using (true);
create policy read_all on player_match_stats for select to authenticated using (true);
create policy read_all on club_tip_offers for select to authenticated using (true);
create policy read_all on profiles for select to authenticated using (true);

create function kicked_off(p_fixture int) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select kickoff_time <= now() from fixtures where id = p_fixture), false)
$$;

create policy read_own_or_started on match_tips for select to authenticated
  using (user_id = auth.uid() or kicked_off(fixture_id));
create policy write_own on match_tips for insert to authenticated with check (user_id = auth.uid());
create policy update_own on match_tips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own on match_tips for delete to authenticated using (user_id = auth.uid());

create policy read_own_or_started on club_tips for select to authenticated
  using (user_id = auth.uid() or kicked_off(fixture_id));
create policy write_own on club_tips for insert to authenticated with check (user_id = auth.uid());
create policy update_own on club_tips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own on club_tips for delete to authenticated using (user_id = auth.uid());
