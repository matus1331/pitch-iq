-- Duels need at least 10 free IQ in the category, from both players (stakes stay 5, 10, 20).
-- Players carry FPL's availability: status (a available, d doubtful, i injured, s suspended,
-- u unavailable, n not in the squad), chance of playing next round (null = no news, fit), the news text,
-- and start_pct: league starts this season / league matches the club has finished (null before the first match).
alter table players add column status text not null default 'a',
  add column chance_next smallint, add column news text, add column start_pct smallint;

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
  if p_category is null or p_category not in ('individual', 'club') then
    raise exception 'DUEL_CATEGORY_INVALID' using errcode = 'P0001';
  end if;
  if p_stake is null or p_stake not in (5, 10, 20) then raise exception 'DUEL_STAKE_INVALID' using errcode = 'P0001'; end if;
  if p_opponent = me or not exists (select 1 from profiles where id = p_opponent) then
    raise exception 'DUEL_INVALID_OPPONENT' using errcode = 'P0001';
  end if;
  if round is null then raise exception 'DUEL_NO_ROUND' using errcode = 'P0001'; end if;
  -- Serialise duel changes of both players (fixed order, so two challenges cannot deadlock):
  -- parallel requests must not slip past the limits or bet the same IQ twice.
  perform pg_advisory_xact_lock(hashtextextended(least(me, p_opponent)::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(greatest(me, p_opponent)::text, 1));
  -- One duel per pair and round, whatever the category.
  if exists (select 1 from duels where gameweek_id = round and status in ('pending', 'accepted')
             and least(challenger_id, opponent_id) = least(me, p_opponent)
             and greatest(challenger_id, opponent_id) = greatest(me, p_opponent)) then
    raise exception 'DUEL_EXISTS' using errcode = 'P0001';
  end if;
  if duel_open_count(me, round) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
  if duel_open_count(p_opponent, round) >= 2 then raise exception 'DUEL_OPPONENT_LIMIT' using errcode = 'P0001'; end if;
  if duel_free_iq(me, p_category) < 10 then raise exception 'DUEL_NOT_ENOUGH_IQ' using errcode = 'P0001'; end if;
  if duel_free_iq(me, p_category) < p_stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  if duel_free_iq(p_opponent, p_category) < greatest(p_stake, 10) then raise exception 'DUEL_OPPONENT_NO_IQ' using errcode = 'P0001'; end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake, category)
  values (round, me, p_opponent, p_stake, p_category)
  returning * into result;
  return result;
end $$;
