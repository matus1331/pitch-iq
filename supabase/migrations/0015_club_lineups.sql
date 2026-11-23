-- Môj klub lineup: each owner of a club picks 5 players of the club per fixture (gk/def/mid/fwd/flex).

alter table players add column total_points int, add column form numeric, add column minutes int,
  add column goals_scored int, add column assists int;

-- Tip offers now carry the whole catalog, not six keys.
alter table club_tip_offers drop constraint club_tip_offers_tip_keys_check;

create table club_lineups (
  user_id uuid not null references profiles on delete cascade,
  fixture_id int not null references fixtures,
  slot text not null check (slot in ('gk', 'def', 'mid', 'fwd', 'flex')),
  player_id int not null references players,
  points int,
  is_final boolean not null default false,
  primary key (user_id, fixture_id, slot),
  unique (user_id, fixture_id, player_id)
);

create function club_lineups_guard() returns trigger language plpgsql set search_path = public as $$
declare
  my_club int;
  p players;
begin
  -- The sync job (service role) writes points and carried-over lineups, also after kickoff.
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open_lineup(old.fixture_id); return old; end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
  perform assert_open_lineup(new.fixture_id);

  select club_team_id into my_club from profiles where id = new.user_id;
  if my_club is null or not exists (
    select 1 from fixtures where id = new.fixture_id and my_club in (team_h, team_a)
  ) then
    raise exception 'LINEUP_WRONG_FIXTURE' using errcode = 'P0001';
  end if;

  select * into p from players where id = new.player_id;
  if p.id is null or p.team_id <> my_club then
    raise exception 'LINEUP_WRONG_PLAYER' using errcode = 'P0001';
  end if;
  if not (case new.slot when 'gk' then p.position = 1 when 'def' then p.position = 2
                        when 'mid' then p.position = 3 when 'fwd' then p.position = 4
                        else p.position <> 1 end) then
    raise exception 'LINEUP_WRONG_SLOT' using errcode = 'P0001';
  end if;
  if p.status in ('i', 's', 'u', 'n') then
    raise exception 'LINEUP_PLAYER_OUT' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

create function assert_open_lineup(p_fixture int) returns void language plpgsql stable set search_path = public as $$
declare k timestamptz;
begin
  select kickoff_time into k from fixtures where id = p_fixture;
  if k is null or k <= now() then
    raise exception 'LINEUP_LOCKED' using errcode = 'P0001';
  end if;
end $$;

create trigger club_lineups_guard before insert or update or delete on club_lineups
for each row execute function club_lineups_guard();

alter table club_lineups enable row level security;
create policy read_own_or_started on club_lineups for select to authenticated
  using (user_id = auth.uid() or ((select is_member()) and kicked_off(fixture_id)));
create policy write_own on club_lineups for insert to authenticated with check (user_id = auth.uid());
create policy update_own on club_lineups for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own on club_lineups for delete to authenticated using (user_id = auth.uid());

-- Points per user and round: tips and lineups; `points` is the sum. A user with only lineup points still gets a row.
create or replace view leaderboard_club with (security_invoker = true) as
select p.id as user_id, p.nickname, p.club_team_id as team_id, tm.code as team_code,
       s.gameweek_id, sum(s.tip_points)::int + sum(s.lineup_points)::int as points,
       sum(s.lineup_points)::int as lineup_points
from (
  select t.user_id, f.gameweek_id, t.points as tip_points, 0 as lineup_points
  from club_tips t join fixtures f on f.id = t.fixture_id
  where t.points is not null and f.gameweek_id is not null
  union all
  select l.user_id, f.gameweek_id, 0, l.points
  from club_lineups l join fixtures f on f.id = l.fixture_id
  where l.points is not null and f.gameweek_id is not null
) s
join profiles p on p.id = s.user_id
join teams tm on tm.id = p.club_team_id
group by p.id, p.nickname, p.club_team_id, tm.code, s.gameweek_id;

create or replace function iq_total(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(points) from match_tips where user_id = p_user), 0)
        + coalesce((select sum(points) from club_tips where user_id = p_user), 0)
        + coalesce((select sum(points) from club_lineups where user_id = p_user), 0)
        + coalesce((select sum(case when challenger_id = p_user then challenger_delta else opponent_delta end)
                    from duels where status = 'finished' and p_user in (challenger_id, opponent_id)), 0))::int
$$;

-- The guard is for the trigger only; assert_open_lineup stays callable because the trigger runs it as the client.
revoke execute on function club_lineups_guard() from public, anon, authenticated;
revoke execute on function assert_open_lineup(int) from public, anon;
