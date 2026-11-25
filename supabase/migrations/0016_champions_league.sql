-- Champions League: a separate competition (result tips only) with its own tables, so its IQ can never mix with
-- the Premier League's levels, boards, duels or notifications. Column names mirror fixtures / match_tips.

create table cl_teams (
  id int primary key,
  name text not null,
  short_name text not null,
  crest text
);

create table cl_fixtures (
  id int primary key,
  -- Round: 1-8 league phase, 9 play-off, 10 last 16, 11 quarter-finals, 12 semi-finals, 13 final.
  gameweek_id int not null check (gameweek_id between 1 and 13),
  kickoff_time timestamptz,
  team_h int not null references cl_teams,
  team_a int not null references cl_teams,
  -- Always the score after 90 minutes.
  team_h_score int,
  team_a_score int,
  started boolean not null default false,
  finished_provisional boolean not null default false,
  finished boolean not null default false
);

create table cl_match_tips (
  user_id uuid not null references profiles on delete cascade,
  fixture_id int not null references cl_fixtures,
  home_goals int not null check (home_goals between 0 and 20),
  away_goals int not null check (away_goals between 0 and 20),
  points int,
  is_final boolean not null default false,
  primary key (user_id, fixture_id)
);
create index on cl_match_tips (fixture_id);

-- Also locked by `started`: the stored schedule can be late, a match that runs must never take tips.
create function cl_locked(p_fixture int) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select kickoff_time is null or kickoff_time <= now() or started from cl_fixtures where id = p_fixture), true)
$$;
-- A postponed match is locked, but its tips stay hidden until it is played.
create function cl_revealed(p_fixture int) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(kickoff_time <= now(), false) or started from cl_fixtures where id = p_fixture), false)
$$;
-- Signed-in users keep execute: the policy and the trigger run as the reader.
revoke execute on function cl_locked(int), cl_revealed(int) from public, anon;
grant execute on function cl_locked(int), cl_revealed(int) to authenticated, service_role;

create function cl_match_tips_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if cl_locked(old.fixture_id) then raise exception 'TIP_LOCKED' using errcode = 'P0001'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
  if cl_locked(new.fixture_id) then raise exception 'TIP_LOCKED' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

create trigger cl_match_tips_guard before insert or update or delete on cl_match_tips
for each row execute function cl_match_tips_guard();

alter table cl_teams enable row level security;
alter table cl_fixtures enable row level security;
alter table cl_match_tips enable row level security;

create policy read_all on cl_teams for select to authenticated using (true);
create policy read_all on cl_fixtures for select to authenticated using (true);
create policy read_own_or_started on cl_match_tips for select to authenticated
  using (user_id = auth.uid() or ((select is_member()) and cl_revealed(fixture_id)));
create policy write_own on cl_match_tips for insert to authenticated with check (user_id = auth.uid());
create policy update_own on cl_match_tips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own on cl_match_tips for delete to authenticated using (user_id = auth.uid());
