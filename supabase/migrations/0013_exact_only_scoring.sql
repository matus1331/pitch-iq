-- New match scoring: right winner/draw 3 IQ, exact score +3 IQ (6 in total).
-- From round 12 on clients may only tip an exact score; older 1/X/2 tips stay and still score 3.

create or replace function match_tips_guard() returns trigger language plpgsql as $$
begin
  if not is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then perform assert_open(old.fixture_id); return old; end if;
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

-- Rescore every exact tip that already has points (the sync only rescores the last two rounds).
update match_tips t
set points = case
  when (t.home_goals, t.away_goals) = (f.team_h_score, f.team_a_score) then 6
  when sign(t.home_goals - t.away_goals) = sign(f.team_h_score - f.team_a_score) then 3
  else 0
end
from fixtures f
where f.id = t.fixture_id and t.kind = 'exact' and t.points is not null
  and f.team_h_score is not null and f.team_a_score is not null;
