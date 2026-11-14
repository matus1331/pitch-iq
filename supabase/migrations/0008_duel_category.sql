-- A duel is played in one category: 'individual' (match result tips) or 'club' (club tips).
-- The duel compares only that category's IQ in the round, the stake is tied up in that category,
-- and the result is added to that category. Existing duels compared everything; they count as 'individual'.
alter table duels add column category text not null default 'individual' check (category in ('individual', 'club'));

-- IQ in one category: its scored tips plus finished duels played in it.
create function iq_in(p_user uuid, p_category text) returns int
language sql stable security definer set search_path = public as $$
  select (case p_category
            when 'individual' then coalesce((select sum(points) from match_tips where user_id = p_user), 0)
            else coalesce((select sum(points) from club_tips where user_id = p_user), 0) end
        + coalesce((select sum(case when challenger_id = p_user then challenger_delta else opponent_delta end)
                    from duels where status = 'finished' and category = p_category
                      and p_user in (challenger_id, opponent_id)), 0))::int
$$;

-- IQ tied up in one category: accepted duels and the player's own outgoing challenges.
drop function duel_locked_stakes(uuid, bigint);
create function duel_locked_stakes(p_user uuid, p_category text, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stake), 0)::int from duels
  where category = p_category and id is distinct from p_except
    and ((status = 'accepted' and p_user in (challenger_id, opponent_id))
      or (status = 'pending' and challenger_id = p_user))
$$;

create function duel_free_iq(p_user uuid, p_category text, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select iq_in(p_user, p_category) - duel_locked_stakes(p_user, p_category, p_except)
$$;

drop function challenge_duel(uuid, int);
create function challenge_duel(p_opponent uuid, p_stake int, p_category text) returns duels
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
  -- One duel per pair and round, whatever the category.
  if exists (select 1 from duels where gameweek_id = round and status in ('pending', 'accepted')
             and least(challenger_id, opponent_id) = least(me, p_opponent)
             and greatest(challenger_id, opponent_id) = greatest(me, p_opponent)) then
    raise exception 'DUEL_EXISTS' using errcode = 'P0001';
  end if;
  if duel_open_count(me, round) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
  if duel_open_count(p_opponent, round) >= 2 then raise exception 'DUEL_OPPONENT_LIMIT' using errcode = 'P0001'; end if;
  if duel_free_iq(me, p_category) < 5 then raise exception 'DUEL_NOT_ENOUGH_IQ' using errcode = 'P0001'; end if;
  if duel_free_iq(me, p_category) < p_stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  if duel_free_iq(p_opponent, p_category) < p_stake then raise exception 'DUEL_OPPONENT_NO_IQ' using errcode = 'P0001'; end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake, category)
  values (round, me, p_opponent, p_stake, p_category)
  returning * into result;
  return result;
end $$;

create or replace function respond_duel(p_duel bigint, p_accept boolean) returns duels
language plpgsql security definer set search_path = public as $$
declare
  d duels;
  me uuid := auth.uid();
begin
  select * into d from duels where id = p_duel for update;
  if d is null or d.opponent_id is distinct from me then raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001'; end if;
  if d.status <> 'pending' then raise exception 'DUEL_NOT_PENDING' using errcode = 'P0001'; end if;
  if exists (select 1 from fixtures where gameweek_id = d.gameweek_id and started) then
    raise exception 'DUEL_CLOSED' using errcode = 'P0001';
  end if;
  if p_accept then
    if duel_open_count(me, d.gameweek_id, d.id) >= 2 then raise exception 'DUEL_LIMIT' using errcode = 'P0001'; end if;
    if duel_free_iq(me, d.category, d.id) < d.stake then raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001'; end if;
  end if;
  update duels set status = case when p_accept then 'accepted' else 'declined' end where id = d.id returning * into d;
  return d;
end $$;

revoke execute on function iq_in(uuid, text), duel_locked_stakes(uuid, text, bigint), duel_free_iq(uuid, text, bigint),
  challenge_duel(uuid, int, text) from public, anon;
grant execute on function challenge_duel(uuid, int, text) to authenticated;
