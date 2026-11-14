create unique index profiles_nickname_ci on profiles (lower(nickname));

create function complete_profile(p_nickname text, p_invite_code text) returns profiles
language plpgsql security definer set search_path = public as $$
declare
  nick text := btrim(p_nickname);
  result profiles;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if p_invite_code is distinct from (select value from app_config where key = 'invite_code') then
    raise exception 'INVALID_INVITE' using errcode = 'P0001';
  end if;
  if char_length(nick) not between 2 and 20 then
    raise exception 'NICKNAME_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'PROFILE_EXISTS' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where lower(nickname) = lower(nick)) then
    raise exception 'NICKNAME_TAKEN' using errcode = 'P0001';
  end if;
  insert into profiles (id, nickname) values (auth.uid(), nick) returning * into result;
  return result;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN' using errcode = 'P0001';
end $$;

create function choose_club(p_team_id int) returns profiles
language plpgsql security definer set search_path = public as $$
declare result profiles;
begin
  if exists (select 1 from profiles where id = auth.uid() and club_team_id is not null) then
    raise exception 'CLUB_LOCKED' using errcode = 'P0001';
  end if;
  update profiles set club_team_id = p_team_id where id = auth.uid() returning * into result;
  if result is null then raise exception 'PROFILE_MISSING' using errcode = 'P0001'; end if;
  return result;
exception when unique_violation then
  raise exception 'CLUB_TAKEN' using errcode = 'P0001';
end $$;

revoke execute on function complete_profile(text, text), choose_club(int) from public, anon;
grant execute on function complete_profile(text, text), choose_club(int) to authenticated;
