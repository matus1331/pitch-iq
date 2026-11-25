begin;
select plan(16);

-- seed (as postgres, bypasses RLS)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local');
insert into profiles (id, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'pgtap_alfa'),
  ('00000000-0000-0000-0000-00000000000b', 'pgtap_beta');
insert into cl_teams (id, name, short_name) values (9001, 'SK Slavia Praha', 'Slavia'), (9002, 'FC Bayern', 'Bayern');
insert into cl_fixtures (id, gameweek_id, kickoff_time, team_h, team_a, started) values
  (9200, 6, now() + interval '1 day', 9001, 9002, false),     -- open
  (9201, 5, now() - interval '1 minute', 9001, 9002, false),  -- kicked off
  (9202, 6, null, 9001, 9002, false),                         -- postponed
  (9203, 6, now() + interval '1 day', 9001, 9002, true),      -- really started before its stored kickoff
  (9204, 6, now() + interval '2 days', 9001, 9002, false);    -- second open match
insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals) values
  ('00000000-0000-0000-0000-00000000000a', 9201, 1, 0),
  ('00000000-0000-0000-0000-00000000000b', 9201, 2, 0),
  ('00000000-0000-0000-0000-00000000000a', 9202, 1, 1);

-- act as A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok($$update cl_match_tips set home_goals = 5 where fixture_id = 9201 and user_id = auth.uid()$$,
  'TIP_LOCKED', 'tip_after_kickoff_cannot_change');
select throws_ok($$delete from cl_match_tips where fixture_id = 9201 and user_id = auth.uid()$$,
  'TIP_LOCKED', 'tip_after_kickoff_cannot_be_deleted');
select throws_ok($$update cl_match_tips set home_goals = 5 where fixture_id = 9202$$,
  'TIP_LOCKED', 'postponed_match_is_locked');
select throws_ok($$insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals) values (auth.uid(), 9203, 1, 0)$$,
  'TIP_LOCKED', 'started_match_is_locked_before_its_stored_kickoff');
select throws_ok($$insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals) values (auth.uid(), 9999, 1, 0)$$,
  'TIP_LOCKED', 'unknown_match_is_locked');

select lives_ok($$insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals, points, is_final) values (auth.uid(), 9200, 2, 1, 99, true)$$,
  'open_tip_accepted');
select results_eq($$select points, is_final from cl_match_tips where fixture_id = 9200 and user_id = auth.uid()$$,
  $$values (null::int, false)$$, 'client_cannot_set_points_on_insert');
update cl_match_tips set points = 99, is_final = true where fixture_id = 9200 and user_id = auth.uid();
select results_eq($$select points, is_final from cl_match_tips where fixture_id = 9200 and user_id = auth.uid()$$,
  $$values (null::int, false)$$, 'client_cannot_set_points_on_update');
select throws_ok($$update cl_match_tips set fixture_id = 9204 where fixture_id = 9200$$,
  'TIP_FIXTURE_IMMUTABLE', 'tip_cannot_move_to_other_match');
select throws_ok($$insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals) values (auth.uid(), 9204, 21, 0)$$,
  '23514', null, 'more_than_20_goals_rejected');
select throws_ok($$insert into cl_match_tips (user_id, fixture_id, home_goals, away_goals) values ('00000000-0000-0000-0000-00000000000b', 9204, 1, 0)$$,
  '42501', null, 'cannot_tip_for_someone_else');
select throws_ok($$insert into cl_fixtures (id, gameweek_id, team_h, team_a) values (9300, 6, 9001, 9002)$$,
  '42501', null, 'client_cannot_write_matches');

-- act as B
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from cl_match_tips where fixture_id = 9200), 0, 'other_tip_hidden_before_kickoff');
select is((select count(*)::int from cl_match_tips where fixture_id = 9202), 0, 'other_tip_hidden_while_postponed');
select is((select count(*)::int from cl_match_tips where fixture_id = 9201), 2, 'other_tip_visible_after_kickoff');

-- act as C: signed in, but not a member (no profile)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from cl_match_tips), 0, 'non_member_sees_no_tips');

reset role;
select * from finish();
rollback;
