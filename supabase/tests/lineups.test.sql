begin;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into teams (id, code, name, short_name) values (9001, 3, 'Arsenal', 'ARS'), (9011, 11, 'Everton', 'EVE') on conflict do nothing;
insert into gameweeks (id, deadline_time, is_current, is_next, finished) values (9013, now(), true, false, false);
insert into fixtures (id, gameweek_id, kickoff_time, team_h, team_a) values
  (9100, 9013, now() + interval '1 day', 9011, 9001),    -- open
  (9101, 9013, now() - interval '1 minute', 9011, 9001), -- locked
  (9102, null, null, 9011, 9001);                        -- postponed
insert into profiles (id, nickname, club_team_id) values
  ('00000000-0000-0000-0000-00000000000a', 'pgtap_alfa', 9011),
  ('00000000-0000-0000-0000-00000000000b', 'pgtap_beta', null);
insert into players (id, team_id, web_name, position, status) values
  (90111, 9011, 'Keeper', 1, 'a'), (90112, 9011, 'Defender', 2, 'a'),
  (90113, 9011, 'Injured', 3, 'i'), (90114, 9011, 'Doubtful', 4, 'd'),
  (90115, 9001, 'Rival', 2, 'a');

-- rows seeded as postgres (the sync job): a locked-match lineup, a scored lineup and a scored club tip
insert into club_lineups (user_id, fixture_id, slot, player_id, points, is_final) values
  ('00000000-0000-0000-0000-00000000000a', 9101, 'gk', 90111, null, false),
  ('00000000-0000-0000-0000-00000000000a', 9101, 'def', 90112, 7, true);
insert into club_tips (user_id, fixture_id, tip_key, points, is_final) values
  ('00000000-0000-0000-0000-00000000000a', 9101, 'team_red', 3, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'gk', 90111)$$,
  'goalkeeper_in_gk_slot_accepted');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'def', 90111)$$,
  'LINEUP_WRONG_SLOT', 'goalkeeper_in_def_slot_rejected');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'flex', 90111)$$,
  'LINEUP_WRONG_SLOT', 'goalkeeper_in_flex_rejected');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'mid', 90113)$$,
  'LINEUP_PLAYER_OUT', 'injured_player_rejected');
select lives_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'flex', 90114)$$,
  'doubtful_player_accepted');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9100, 'def', 90115)$$,
  'LINEUP_WRONG_PLAYER', 'other_club_player_rejected');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9101, 'fwd', 90114)$$,
  'LINEUP_LOCKED', 'insert_after_kickoff_rejected');
select throws_ok(
  $$update club_lineups set player_id = 90114, slot = 'flex' where fixture_id = 9101 and slot = 'def'$$,
  'LINEUP_LOCKED', 'update_after_kickoff_rejected');
select throws_ok(
  $$delete from club_lineups where fixture_id = 9101 and slot = 'gk'$$,
  'LINEUP_LOCKED', 'delete_after_kickoff_rejected');
select throws_ok(
  $$insert into club_lineups (user_id, fixture_id, slot, player_id) values (auth.uid(), 9102, 'gk', 90111)$$,
  'LINEUP_LOCKED', 'postponed_match_rejected');

insert into club_lineups (user_id, fixture_id, slot, player_id, points, is_final) values (auth.uid(), 9100, 'def', 90112, 99, true);
select is((select points from club_lineups where fixture_id = 9100 and slot = 'def'), null::int, 'client_cannot_set_points');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from club_lineups where fixture_id = 9100), 0, 'other_lineup_hidden_before_kickoff');
select is((select count(*)::int from club_lineups where fixture_id = 9101), 2, 'other_lineup_visible_after_kickoff');

reset role;

select lives_ok(
  $$insert into club_tip_offers (fixture_id, team_id, tip_keys) values (9102, 9011, array(select 'k' || g from generate_series(1, 21) g))$$,
  'offer_with_21_keys_accepted');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select results_eq(
  $$select points, lineup_points from leaderboard_club where user_id = auth.uid() and gameweek_id = 9013$$,
  $$values (10, 7)$$, 'leaderboard_sums_tips_and_lineup');

select * from finish();
rollback;
