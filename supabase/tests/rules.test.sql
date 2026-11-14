begin;
select plan(14);

-- seed (as postgres, bypasses RLS)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into teams (id, code, name, short_name) values (9001, 3, 'Arsenal', 'ARS'), (9011, 11, 'Everton', 'EVE') on conflict do nothing;
insert into gameweeks (id, deadline_time, is_current, is_next, finished) values (9013, now(), true, false, false);
insert into fixtures (id, gameweek_id, kickoff_time, team_h, team_a) values
  (9100, 9013, now() + interval '1 day', 9011, 9001),   -- open
  (9101, 9013, now() - interval '1 minute', 9011, 9001), -- locked
  (9102, null, null, 9011, 9001),                      -- postponed
  (9103, 9013, now() + interval '2 days', 9001, 9011); -- second open match
insert into profiles (id, nickname, club_team_id) values
  ('00000000-0000-0000-0000-00000000000a', 'pgtap_alfa', 9011),
  ('00000000-0000-0000-0000-00000000000b', 'pgtap_beta', null);
insert into club_tip_offers (fixture_id, team_id, tip_keys) values
  (9100, 9011, array['player_goal','player_assist','player_yellow','team_red','team_clean_sheet','match_own_goal']),
  (9103, 9011, array['player_goal','player_assist','player_yellow','team_red','team_clean_sheet','match_own_goal']);

-- rows that exist before kickoff passed (inserted as postgres)
insert into match_tips (user_id, fixture_id, kind, outcome) values
  ('00000000-0000-0000-0000-00000000000a', 9101, '1x2', 'H');

-- act as A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$insert into match_tips (user_id, fixture_id, kind, outcome) values ('00000000-0000-0000-0000-00000000000a', 9101, '1x2', 'D')
    on conflict (user_id, fixture_id) do update set outcome = excluded.outcome$$,
  'TIP_LOCKED', 'tip_after_kickoff_rejected');

select throws_ok(
  $$insert into match_tips (user_id, fixture_id, kind, outcome) values ('00000000-0000-0000-0000-00000000000a', 9102, '1x2', 'D')$$,
  'TIP_LOCKED', 'tip_null_kickoff_rejected');

select lives_ok(
  $$insert into match_tips (user_id, fixture_id, kind, home_goals, away_goals, points) values ('00000000-0000-0000-0000-00000000000a', 9100, 'exact', 2, 1, 99)$$,
  'open tip accepted');

select is((select points from match_tips where fixture_id = 9100 and user_id = auth.uid()), null::int,
  'client_cannot_set_points');

-- club tips
insert into club_tips (user_id, fixture_id, tip_key, player_id) values (auth.uid(), 9100, 'player_goal', 5);
insert into club_tips (user_id, fixture_id, tip_key, player_id) values (auth.uid(), 9100, 'player_assist', 5);
insert into club_tips (user_id, fixture_id, tip_key) values (auth.uid(), 9100, 'team_red');
select throws_ok(
  $$insert into club_tips (user_id, fixture_id, tip_key) values (auth.uid(), 9100, 'match_own_goal')$$,
  'CLUB_TIP_LIMIT', 'club_tip_fourth_rejected');
select throws_ok(
  $$update club_tips set tip_key = 'team_xg_over' where tip_key = 'team_red'$$,
  'CLUB_TIP_NOT_OFFERED', 'club_tip_not_in_offer_rejected');
select throws_ok(
  $$update club_tips set fixture_id = 9103, tip_key = 'team_clean_sheet' where tip_key = 'team_red'$$,
  'TIP_FIXTURE_IMMUTABLE', 'club_tip_cannot_move_to_other_match');
select throws_ok(
  $$update match_tips set fixture_id = 9103 where fixture_id = 9100$$,
  'TIP_FIXTURE_IMMUTABLE', 'match_tip_cannot_move_to_other_match');
select throws_ok(
  $$update match_tips set kind = 'exact', outcome = null, home_goals = 1, away_goals = 0 where fixture_id = 9101$$,
  'TIP_LOCKED', 'locked_tip_cannot_be_edited');

-- act as B (no club) – sees nothing of A for the open match
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from match_tips where fixture_id = 9100), 0, 'other_tip_hidden_before_kickoff');
select is((select count(*)::int from match_tips where fixture_id = 9101), 1, 'other_tip_visible_after_kickoff');
select throws_ok(
  $$insert into club_tips (user_id, fixture_id, tip_key) values (auth.uid(), 9100, 'team_red')$$,
  'CLUB_TIP_WRONG_FIXTURE', 'club_tip_wrong_fixture_rejected');

reset role;

select throws_ok(
  $$update profiles set club_team_id = 9011 where nickname = 'pgtap_beta'$$,
  '23505', null, 'club_unique');
select throws_ok(
  $$update profiles set club_team_id = 9001 where nickname = 'pgtap_alfa'$$,
  'CLUB_LOCKED', 'club_change_locked');

select * from finish();
rollback;
