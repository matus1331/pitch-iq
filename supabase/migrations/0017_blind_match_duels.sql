-- Match duels, reworked: both players tip blind. A picks 1, 1X, X, X2 or 2 when challenging, B picks the same way
-- when accepting (no longer tied to B's match tip). Neither sees the other's pick before kickoff.
-- Settlement (sync): only one hit → he wins the stake (half with a double chance), the other loses it;
-- both hit or both missed (same pick included) → nothing moves. No duel had been played yet, nothing is converted.

-- Picks live in their own table so RLS can hide the opponent's pick until kickoff.
create table duel_picks (
  duel_id bigint not null references duels on delete cascade,
  user_id uuid not null references profiles,
  pick text not null check (pick in ('H', 'HD', 'D', 'DA', 'A')),
  primary key (duel_id, user_id)
);
alter table duel_picks enable row level security;
grant select on duel_picks to authenticated;
grant select, insert, update, delete on duel_picks to service_role;
create policy duel_picks_read on duel_picks for select to authenticated using (
  (select is_member()) and (user_id = auth.uid() or kicked_off((select fixture_id from duels where id = duel_id)))
);

-- B's match tip is no longer frozen by a duel.
create or replace function match_tips_guard() returns trigger language plpgsql as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    perform assert_open(old.fixture_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
  perform assert_open(new.fixture_id);
  if new.kind = '1x2' and (select gameweek_id from fixtures where id = new.fixture_id) >= 12 then
    raise exception 'TIP_EXACT_ONLY' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

drop function pick_duel(bigint, text);
alter table duels drop column opponent_pick, drop column challenger_pick;

drop function challenge_match_duel(uuid, int, int);
create function challenge_match_duel(p_opponent uuid, p_fixture int, p_stake int, p_pick text) returns duels
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f fixtures;
  result duels;
begin
  if me is null or not exists (select 1 from profiles where id = me) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_stake is null or p_stake not in (5, 10, 20) then raise exception 'DUEL_STAKE_INVALID' using errcode = 'P0001'; end if;
  if p_pick is null or p_pick not in ('H', 'HD', 'D', 'DA', 'A') then raise exception 'DUEL_PICK_INVALID' using errcode = 'P0001'; end if;
  if p_opponent = me or not exists (select 1 from profiles where id = p_opponent) then
    raise exception 'DUEL_INVALID_OPPONENT' using errcode = 'P0001';
  end if;
  select * into f from fixtures where id = p_fixture;
  if f is null or f.kickoff_time is null or f.kickoff_time <= now() or f.gameweek_id is null then
    raise exception 'DUEL_FIXTURE_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(me, p_opponent)::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(greatest(me, p_opponent)::text, 1));
  -- One duel per pair and match, ever (a cancelled challenge B never saw does not count).
  if exists (select 1 from duels where fixture_id = p_fixture and status <> 'cancelled'
             and least(challenger_id, opponent_id) = least(me, p_opponent)
             and greatest(challenger_id, opponent_id) = greatest(me, p_opponent)) then
    raise exception 'DUEL_EXISTS' using errcode = 'P0001';
  end if;
  if match_duel_count(me, f.gameweek_id) >= 3 then raise exception 'DUEL_MATCH_LIMIT' using errcode = 'P0001'; end if;
  if match_duel_count(p_opponent, f.gameweek_id) >= 3 then raise exception 'DUEL_OPPONENT_MATCH_LIMIT' using errcode = 'P0001'; end if;
  if respect_free(me) < 10 then raise exception 'DUEL_NOT_ENOUGH_R' using errcode = 'P0001'; end if;
  if respect_free(me) < p_stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  if respect_free(p_opponent) < greatest(p_stake, 10) then raise exception 'DUEL_OPPONENT_NO_R' using errcode = 'P0001'; end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake, category, fixture_id)
  values (f.gameweek_id, me, p_opponent, p_stake, 'match', p_fixture)
  returning * into result;
  insert into duel_picks (duel_id, user_id, pick) values (result.id, me, p_pick);
  return result;
end $$;

-- B accepts a match duel with his own pick.
drop function respond_duel(bigint, boolean);
create function respond_duel(p_duel bigint, p_accept boolean, p_pick text default null) returns duels
language plpgsql security definer set search_path = public as $$
declare
  d duels;
  me uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 1));
  select * into d from duels where id = p_duel for update;
  if d is null or d.opponent_id is distinct from me then raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001'; end if;
  if d.status <> 'pending' then raise exception 'DUEL_NOT_PENDING' using errcode = 'P0001'; end if;
  if (d.category = 'match' and kicked_off(d.fixture_id))
     or (d.category <> 'match' and exists (select 1 from fixtures where gameweek_id = d.gameweek_id and started)) then
    raise exception 'DUEL_CLOSED' using errcode = 'P0001';
  end if;
  if not p_accept then
    update duels set status = 'declined' where id = d.id returning * into d;
    return d;
  end if;
  if respect_free(me, d.id) < d.stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  if d.category = 'match' then
    if p_pick is null or p_pick not in ('H', 'HD', 'D', 'DA', 'A') then raise exception 'DUEL_PICK_INVALID' using errcode = 'P0001'; end if;
    if match_duel_count(me, d.gameweek_id, d.id) >= 3 then raise exception 'DUEL_MATCH_LIMIT' using errcode = 'P0001'; end if;
    insert into duel_picks (duel_id, user_id, pick) values (d.id, me, p_pick);
  else
    if duel_open_count(me, d.gameweek_id, d.id) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
  end if;
  update duels set status = 'accepted' where id = d.id returning * into d;
  return d;
end $$;

-- Only an unanswered challenge can be cancelled now: an accepted duel already has both picks.
create or replace function cancel_duel(p_duel bigint) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel for update;
  if d is null or d.challenger_id is distinct from auth.uid() then raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001'; end if;
  if d.status <> 'pending' then raise exception 'DUEL_NOT_PENDING' using errcode = 'P0001'; end if;
  update duels set status = 'cancelled' where id = d.id returning * into d;
  return d;
end $$;

revoke execute on function challenge_match_duel(uuid, int, int, text), respond_duel(bigint, boolean, text) from public, anon;
grant execute on function challenge_match_duel(uuid, int, int, text), respond_duel(bigint, boolean, text) to authenticated;
