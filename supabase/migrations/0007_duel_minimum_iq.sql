-- Duels need IQ to bet: a player is locked out until they have at least 5 free IQ (the minimum stake),
-- and nobody can be challenged for more IQ than they have free.
-- Only commitments tie up IQ: accepted duels and the player's own outgoing challenges. An incoming
-- challenge does not, otherwise one challenge would stop anyone else from challenging that player.
create or replace function duel_locked_stakes(p_user uuid, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stake), 0)::int from duels
  where id is distinct from p_except
    and ((status = 'accepted' and p_user in (challenger_id, opponent_id))
      or (status = 'pending' and challenger_id = p_user))
$$;

create or replace function challenge_duel(p_opponent uuid, p_stake int) returns duels
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  round int := duel_round();
  result duels;
begin
  if me is null or not exists (select 1 from profiles where id = me) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_stake is null or p_stake not in (5, 10, 20) then raise exception 'DUEL_STAKE_INVALID' using errcode = 'P0001'; end if;
  if p_opponent = me or not exists (select 1 from profiles where id = p_opponent) then
    raise exception 'DUEL_INVALID_OPPONENT' using errcode = 'P0001';
  end if;
  if round is null then raise exception 'DUEL_NO_ROUND' using errcode = 'P0001'; end if;
  if exists (select 1 from duels where gameweek_id = round and status in ('pending', 'accepted')
             and least(challenger_id, opponent_id) = least(me, p_opponent)
             and greatest(challenger_id, opponent_id) = greatest(me, p_opponent)) then
    raise exception 'DUEL_EXISTS' using errcode = 'P0001';
  end if;
  if duel_open_count(me, round) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
  if duel_open_count(p_opponent, round) >= 2 then raise exception 'DUEL_OPPONENT_LIMIT' using errcode = 'P0001'; end if;
  if iq_total(me) - duel_locked_stakes(me) < 5 then raise exception 'DUEL_NOT_ENOUGH_IQ' using errcode = 'P0001'; end if;
  if duel_locked_stakes(me) + p_stake > iq_total(me) then
    raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001';
  end if;
  if iq_total(p_opponent) - duel_locked_stakes(p_opponent) < p_stake then
    raise exception 'DUEL_OPPONENT_NO_IQ' using errcode = 'P0001';
  end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake) values (round, me, p_opponent, p_stake)
  returning * into result;
  return result;
end $$;
