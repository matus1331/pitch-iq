-- Duels: two players bet IQ on who scores more IQ in one round. See docs/superpowers/specs/2026-11-14-duely-design.md.
create table duels (
  id bigint generated always as identity primary key,
  gameweek_id int not null references gameweeks,
  challenger_id uuid not null references profiles on delete cascade,
  opponent_id uuid not null references profiles on delete cascade,
  stake int not null check (stake in (5, 10, 20)),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'finished')),
  challenger_iq int,
  opponent_iq int,
  challenger_delta int,
  opponent_delta int,
  created_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);
create index duels_gameweek on duels (gameweek_id);

alter table duels enable row level security;
create policy duels_read on duels for select to authenticated using (true);
-- No write policies: duels change only through the functions below and the sync job.

-- Current IQ: scored tips plus finished duel results.
create function iq_total(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(points) from match_tips where user_id = p_user), 0)
        + coalesce((select sum(points) from club_tips where user_id = p_user), 0)
        + coalesce((select sum(case when challenger_id = p_user then challenger_delta else opponent_delta end)
                    from duels where status = 'finished' and p_user in (challenger_id, opponent_id)), 0))::int
$$;

-- The round duels are made for: the first round in which no match has started yet.
create function duel_round() returns int
language sql stable security definer set search_path = public as $$
  select min(gameweek_id) from (
    select gameweek_id from fixtures where gameweek_id is not null
    group by gameweek_id having not bool_or(started)
  ) open_rounds
$$;

-- IQ the player already has riding on open duels (optionally ignoring one duel).
create function duel_locked_stakes(p_user uuid, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stake), 0)::int from duels
  where p_user in (challenger_id, opponent_id) and status in ('pending', 'accepted')
    and id is distinct from p_except
$$;

create function duel_open_count(p_user uuid, p_round int, p_except bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from duels
  where gameweek_id = p_round and p_user in (challenger_id, opponent_id)
    and status in ('pending', 'accepted') and id is distinct from p_except
$$;

create function challenge_duel(p_opponent uuid, p_stake int) returns duels
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
  if duel_locked_stakes(me) + p_stake > iq_total(me) then
    raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001';
  end if;
  insert into duels (gameweek_id, challenger_id, opponent_id, stake) values (round, me, p_opponent, p_stake)
  returning * into result;
  return result;
end $$;

create function respond_duel(p_duel bigint, p_accept boolean) returns duels
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
    if duel_locked_stakes(me, d.id) + d.stake > iq_total(me) then
      raise exception 'DUEL_STAKE_TOO_HIGH' using errcode = 'P0001';
    end if;
  end if;
  update duels set status = case when p_accept then 'accepted' else 'declined' end where id = d.id returning * into d;
  return d;
end $$;

create function cancel_duel(p_duel bigint) returns duels
language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel for update;
  if d is null or d.challenger_id is distinct from auth.uid() then raise exception 'DUEL_NOT_YOURS' using errcode = 'P0001'; end if;
  if d.status <> 'pending' then raise exception 'DUEL_NOT_PENDING' using errcode = 'P0001'; end if;
  update duels set status = 'cancelled' where id = d.id returning * into d;
  return d;
end $$;

revoke execute on function iq_total(uuid), duel_round(), duel_locked_stakes(uuid, bigint), duel_open_count(uuid, int, bigint),
  challenge_duel(uuid, int), respond_duel(bigint, boolean), cancel_duel(bigint) from public, anon;
grant execute on function iq_total(uuid), duel_round(), challenge_duel(uuid, int), respond_duel(bigint, boolean), cancel_duel(bigint)
  to authenticated;
