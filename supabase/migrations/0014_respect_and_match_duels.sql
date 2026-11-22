-- Duels move to their own currency, Rešpekt (R), and get a third kind: a duel on one match.
-- See docs/superpowers/specs/2026-11-14-duely-design.md. No duel had been played yet, so nothing is converted.
--
-- Rešpekt = 100 to start + 5 for every finished round from round 12 on in which the player tipped every match
--           + results of finished duels. IQ (and so the level) now comes from tips only.
--
-- Match duel (category 'match'): A challenges B on one match. B accepts with the tip he already has on it;
-- its outcome (H/D/A) becomes B's side and B may no longer change it. A then sees only that side and picks
-- another outcome or the double chance without it, or withdraws. A withdrawal still counts as one of A's
-- three match duels in the round, and A can never challenge B on that match again.

alter table duels drop constraint duels_category_check;
alter table duels add constraint duels_category_check check (category in ('individual', 'club', 'match'));
alter table duels drop constraint duels_status_check;
alter table duels add constraint duels_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'withdrawn', 'finished'));
alter table duels
  add column fixture_id int references fixtures,
  add column opponent_pick text check (opponent_pick in ('H', 'D', 'A')),
  add column challenger_pick text check (challenger_pick in ('H', 'D', 'A', 'HD', 'DA', 'HA')),
  add constraint duels_match_fixture check ((category = 'match') = (fixture_id is not null));

-- Match duels stay between the two players until kickoff: the sides would give their tips away.
drop policy duels_read on duels;
create policy duels_read on duels for select to authenticated using (
  (select is_member()) and (category <> 'match' or auth.uid() in (challenger_id, opponent_id) or kicked_off(fixture_id))
);

create function tip_outcome(t match_tips) returns text language sql immutable as $$
  select case when t.kind = '1x2' then t.outcome
              else case sign(t.home_goals - t.away_goals) when 1 then 'H' when 0 then 'D' else 'A' end end
$$;

create function respect_total(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select (100
    + 5 * (select count(*) from (
        select f.gameweek_id from fixtures f
        left join match_tips t on t.fixture_id = f.id and t.user_id = p_user
        where f.gameweek_id >= 12
        group by f.gameweek_id
        having bool_and(f.finished) and bool_and(t.user_id is not null)
      ) tipped_rounds)
    + coalesce((select sum(case when challenger_id = p_user then challenger_delta else opponent_delta end)
                from duels where status = 'finished' and p_user in (challenger_id, opponent_id)), 0))::int
$$;

-- Rešpekt riding on open duels: accepted ones and the player's own outgoing challenges.
create function respect_locked(p_user uuid, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stake), 0)::int from duels
  where id is distinct from p_except
    and ((status = 'accepted' and p_user in (challenger_id, opponent_id))
      or (status = 'pending' and challenger_id = p_user))
$$;

create function respect_free(p_user uuid, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select respect_total(p_user) - respect_locked(p_user, p_except)
$$;

-- Everyone's Rešpekt for the Duely tab (members only, like every other read).
create function respect_board() returns table (user_id uuid, total int, locked int)
language sql stable security definer set search_path = public as $$
  select id, respect_total(id), respect_locked(id) from profiles where (select is_member())
$$;

-- Round duels: at most 2 open per round (match duels have their own limit).
create or replace function duel_open_count(p_user uuid, p_round int, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from duels
  where gameweek_id = p_round and category <> 'match' and p_user in (challenger_id, opponent_id)
    and status in ('pending', 'accepted') and id is distinct from p_except
$$;

-- Match duels: at most 3 per round. A withdrawal counts for the one who withdrew.
create function match_duel_count(p_user uuid, p_round int, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from duels
  where gameweek_id = p_round and category = 'match' and id is distinct from p_except
    and ((status in ('pending', 'accepted', 'finished') and p_user in (challenger_id, opponent_id))
      or (status = 'withdrawn' and challenger_id = p_user))
$$;

-- Round duels are now always 'individual'; club duels are switched off until they are reworked.
create or replace function challenge_duel(p_opponent uuid, p_stake int, p_category text) returns duels
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  round int := duel_round();
  result duels;
begin
  if me is null or not exists (select 1 from profiles where id = me) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_category is distinct from 'individual' then raise exception 'DUEL_CATEGORY_INVALID' using errcode = 'P0001'; end if;
  if p_stake is null or p_stake not in (5, 10, 20) then raise exception 'DUEL_STAKE_INVALID' using errcode = 'P0001'; end if;
  if p_opponent = me or not exists (select 1 from profiles where id = p_opponent) then
    raise exception 'DUEL_INVALID_OPPONENT' using errcode = 'P0001';
  end if;
  if round is null then raise exception 'DUEL_NO_ROUND' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(me, p_opponent)::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(greatest(me, p_opponent)::text, 1));
  if exists (select 1 from duels where gameweek_id = round and category <> 'match' and status in ('pending', 'accepted')
             and least(challenger_id, opponent_id) = least(me, p_opponent)
             and greatest(challenger_id, opponent_id) = greatest(me, p_opponent)) then
    raise exception 'DUEL_EXISTS' using errcode = 'P0001';
  end if;
  if duel_open_count(me, round) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
  if duel_open_count(p_opponent, round) >= 2 then raise exception 'DUEL_OPPONENT_LIMIT' using errcode = 'P0001'; end if;
  if respect_free(me) < 10 then raise exception 'DUEL_NOT_ENOUGH_R' using errcode = 'P0001'; end if;
  if respect_free(me) < p_stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  if respect_free(p_opponent) < greatest(p_stake, 10) then raise exception 'DUEL_OPPONENT_NO_R' using errcode = 'P0001'; end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake, category)
  values (round, me, p_opponent, p_stake, 'individual')
  returning * into result;
  return result;
end $$;

create function challenge_match_duel(p_opponent uuid, p_fixture int, p_stake int) returns duels
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
  if p_opponent = me or not exists (select 1 from profiles where id = p_opponent) then
    raise exception 'DUEL_INVALID_OPPONENT' using errcode = 'P0001';
  end if;
  select * into f from fixtures where id = p_fixture;
  -- Any match that has not kicked off yet (and is not postponed).
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
  return result;
end $$;

create or replace function respond_duel(p_duel bigint, p_accept boolean) returns duels
language plpgsql security definer set search_path = public as $$
declare
  d duels;
  me uuid := auth.uid();
  tip match_tips;
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
    if match_duel_count(me, d.gameweek_id, d.id) >= 3 then raise exception 'DUEL_MATCH_LIMIT' using errcode = 'P0001'; end if;
    select * into tip from match_tips where user_id = me and fixture_id = d.fixture_id for update;
    if tip is null then raise exception 'DUEL_NEEDS_TIP' using errcode = 'P0001'; end if;
    update duels set status = 'accepted', opponent_pick = tip_outcome(tip) where id = d.id returning * into d;
  else
    if duel_open_count(me, d.gameweek_id, d.id) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
    update duels set status = 'accepted' where id = d.id returning * into d;
  end if;
  return d;
end $$;

-- A picks his side once B has accepted: anything that does not contain B's outcome.
create function pick_duel(p_duel bigint, p_pick text) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel for update;
  if d is null or d.challenger_id is distinct from auth.uid() or d.category <> 'match' then
    raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001';
  end if;
  if d.status <> 'accepted' or d.challenger_pick is not null then raise exception 'DUEL_NOT_PICKABLE' using errcode = 'P0001'; end if;
  if kicked_off(d.fixture_id) then raise exception 'DUEL_CLOSED' using errcode = 'P0001'; end if;
  if p_pick is null or p_pick not in ('H', 'D', 'A', 'HD', 'DA', 'HA') or strpos(p_pick, d.opponent_pick) > 0 then
    raise exception 'DUEL_PICK_INVALID' using errcode = 'P0001';
  end if;
  update duels set challenger_pick = p_pick where id = d.id returning * into d;
  return d;
end $$;

-- The challenger cancels an unanswered challenge, or withdraws from an accepted match duel before picking.
create or replace function cancel_duel(p_duel bigint) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel for update;
  if d is null or d.challenger_id is distinct from auth.uid() then raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001'; end if;
  if d.status = 'pending' then
    update duels set status = 'cancelled' where id = d.id returning * into d;
  elsif d.status = 'accepted' and d.category = 'match' and d.challenger_pick is null then
    update duels set status = 'withdrawn' where id = d.id returning * into d;
  else
    raise exception 'DUEL_NOT_PENDING' using errcode = 'P0001';
  end if;
  return d;
end $$;

-- B's side in an accepted match duel is frozen: the score may change, the outcome may not.
create or replace function match_tips_guard() returns trigger language plpgsql as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    perform assert_open(old.fixture_id);
    if exists (select 1 from duels where fixture_id = old.fixture_id and opponent_id = old.user_id and status = 'accepted') then
      raise exception 'TIP_DUEL_LOCKED' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
  perform assert_open(new.fixture_id);
  if new.kind = '1x2' and (select gameweek_id from fixtures where id = new.fixture_id) >= 12 then
    raise exception 'TIP_EXACT_ONLY' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from duels where fixture_id = new.fixture_id and opponent_id = new.user_id
                                    and status = 'accepted' and opponent_pick <> tip_outcome(new)) then
    raise exception 'TIP_DUEL_LOCKED' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

-- tip_outcome stays callable: the tip trigger runs as the client and the function reads nothing.
revoke execute on function respect_total(uuid), respect_locked(uuid, bigint), respect_free(uuid, bigint),
  match_duel_count(uuid, int, bigint), respect_board(), challenge_match_duel(uuid, int, int), pick_duel(bigint, text)
  from public, anon, authenticated;
grant execute on function respect_board(), challenge_match_duel(uuid, int, int), pick_duel(bigint, text) to authenticated;
