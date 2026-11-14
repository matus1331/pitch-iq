-- Security hardening after a review (2026-11-14).

-- 1. Only players (accounts that finished onboarding with the invite code) may read other people's data.
--    Signing up is open, so "authenticated" alone was not enough: anyone could register and read
--    nicknames, tips and duels without knowing the invite code. Public FPL data (teams, fixtures) stays open.
create function is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid())
$$;
revoke execute on function is_member() from public, anon;

drop policy read_all on profiles;
create policy read_members on profiles for select to authenticated using (id = auth.uid() or (select is_member()));
drop policy read_own_or_started on match_tips;
create policy read_own_or_started on match_tips for select to authenticated
  using (user_id = auth.uid() or ((select is_member()) and kicked_off(fixture_id)));
drop policy read_own_or_started on club_tips;
create policy read_own_or_started on club_tips for select to authenticated
  using (user_id = auth.uid() or ((select is_member()) and kicked_off(fixture_id)));
drop policy duels_read on duels;
create policy duels_read on duels for select to authenticated using ((select is_member()));

-- 2. Race conditions: the limit checks below read, then write. Two requests sent at the same moment
--    could both pass (four club tips instead of three, the same IQ bet twice). A per-player lock closes that.
create or replace function club_tips_guard() returns trigger language plpgsql as $$
declare
  my_club int;
  offer club_tip_offers;
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open(old.fixture_id); return old; end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
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
    -- One insert at a time per player, so parallel requests cannot slip past the limit of three.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if (select count(*) from club_tips where user_id = new.user_id and fixture_id = new.fixture_id) >= 3 then
      raise exception 'CLUB_TIP_LIMIT' using errcode = 'P0001';
    end if;
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

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
  perform pg_advisory_xact_lock(hashtextextended(me::text, 1));
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
