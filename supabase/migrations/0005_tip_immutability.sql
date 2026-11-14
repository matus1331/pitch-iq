-- A tip belongs to one match: clients may not move it to another fixture
-- (that would dodge the kickoff lock and the 3-club-tips limit).

create or replace function match_tips_guard() returns trigger language plpgsql as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open(old.fixture_id); return old; end if;
  if tg_op = 'UPDATE' and (new.fixture_id <> old.fixture_id or new.user_id <> old.user_id) then
    raise exception 'TIP_FIXTURE_IMMUTABLE' using errcode = 'P0001';
  end if;
  perform assert_open(new.fixture_id);
  if tg_op = 'INSERT' then
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;

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
    if (select count(*) from club_tips where user_id = new.user_id and fixture_id = new.fixture_id) >= 3 then
      raise exception 'CLUB_TIP_LIMIT' using errcode = 'P0001';
    end if;
    new.points := null; new.is_final := false;
  else
    new.points := old.points; new.is_final := old.is_final;
  end if;
  return new;
end $$;
