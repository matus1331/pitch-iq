begin;
select plan(34);

-- Test-only data: an open round (9013) with two matches. Everyone starts with 100 Rešpekt.
insert into teams (id, code, name, short_name) values (9001, 3, 'Arsenal', 'ARS'), (9009, 11, 'Everton', 'EVE')
  on conflict do nothing;
insert into gameweeks (id) values (9012), (9013) on conflict do nothing;
insert into fixtures (id, gameweek_id, kickoff_time, team_h, team_a, started, finished) values
  (9200, 9012, now() - interval '3 days', 9001, 9009, true, true),
  (9201, 9013, now() + interval '3 days', 9001, 9009, false, false),
  (9202, 9013, now() + interval '4 days', 9009, 9001, false, false),
  (9203, 9013, now() + interval '5 days', 9001, 9009, false, false),
  (9204, 9013, now() + interval '6 days', 9009, 9001, false, false);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.local');
insert into profiles (id, nickname) values
  ('00000000-0000-0000-0000-0000000000a2', 'pgtap_duel_a'),
  ('00000000-0000-0000-0000-0000000000b2', 'pgtap_duel_b'),
  ('00000000-0000-0000-0000-0000000000c2', 'pgtap_duel_c'),
  ('00000000-0000-0000-0000-0000000000d2', 'pgtap_duel_d'),
  ('00000000-0000-0000-0000-0000000000e2', 'pgtap_duel_e');
-- d lost a finished duel and is down to 9 Rešpekt, one short of the minimum.
insert into duels (gameweek_id, challenger_id, opponent_id, stake, status, challenger_delta, opponent_delta) values
  (9012, '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', 20, 'finished', -91, 0);
-- b tipped 2:1 on match 9201 (home win).
insert into match_tips (user_id, fixture_id, kind, home_goals, away_goals) values
  ('00000000-0000-0000-0000-0000000000b2', 9201, 'exact', 2, 1);

create temp table ids (name text primary key, id bigint);
grant all on ids to authenticated;

select is(respect_total('00000000-0000-0000-0000-0000000000a2'), 100, 'everyone_starts_with_100');
select is(respect_total('00000000-0000-0000-0000-0000000000d2'), 9, 'duel_results_count_into_respect');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

-- Round duels
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 7, 'individual')$$, 'DUEL_STAKE_INVALID', 'stake_must_be_5_10_20');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5, 'club')$$, 'DUEL_CATEGORY_INVALID', 'club_duels_are_switched_off');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000a2', 5, 'individual')$$, 'DUEL_INVALID_OPPONENT', 'cannot_challenge_self');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000d2', 5, 'individual')$$, 'DUEL_OPPONENT_NO_R', 'opponent_needs_10_respect');
insert into ids select 'ab', id from challenge_duel('00000000-0000-0000-0000-0000000000b2', 10, 'individual');
select is((select status from duels where id = (select id from ids where name = 'ab')), 'pending', 'challenge_creates_pending');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5, 'individual')$$, 'DUEL_EXISTS', 'one_round_duel_per_pair');
select is((select total - locked from respect_board() where user_id = auth.uid()), 90, 'own_challenge_locks_the_stake');
select throws_ok($$insert into duels (gameweek_id, challenger_id, opponent_id, stake) values (9013, auth.uid(), '00000000-0000-0000-0000-0000000000d2', 5)$$,
  '42501', null, 'direct_insert_forbidden');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000e2', 5, 'individual')$$, 'DUEL_NOT_ENOUGH_R', 'nine_respect_is_below_minimum');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select status from respond_duel((select id from ids where name = 'ab'), true)), 'accepted', 'opponent_accepts_round_duel');
select throws_ok($$select respond_duel((select id from ids where name = 'ab'), true)$$, 'DUEL_NOT_PENDING', 'cannot_answer_twice');

-- Match duels: a challenges b on 9201 with X2. Both pick blind; b is not tied to his 2:1 tip.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$select challenge_match_duel('00000000-0000-0000-0000-0000000000b2', 9200, 10, 'H')$$, 'DUEL_FIXTURE_INVALID', 'no_duel_on_started_match');
select throws_ok($$select challenge_match_duel('00000000-0000-0000-0000-0000000000b2', 9201, 10, 'HA')$$, 'DUEL_PICK_INVALID', 'no_12_pick');
insert into ids select 'm1', id from challenge_match_duel('00000000-0000-0000-0000-0000000000b2', 9201, 10, 'DA');
select throws_ok($$select challenge_match_duel('00000000-0000-0000-0000-0000000000b2', 9201, 5, 'H')$$, 'DUEL_EXISTS', 'one_duel_per_pair_and_match');
select throws_ok($$insert into duel_picks (duel_id, user_id, pick) values ((select id from ids where name = 'm1'), auth.uid(), 'H')$$,
  '42501', null, 'direct_pick_insert_forbidden');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*)::int from duels where category = 'match'), 0, 'match_duel_hidden_from_others_before_kickoff');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from duel_picks), 0, 'opponent_does_not_see_challengers_pick');
select throws_ok($$select respond_duel((select id from ids where name = 'm1'), true)$$, 'DUEL_PICK_INVALID', 'accept_needs_a_pick');
select is((select status from respond_duel((select id from ids where name = 'm1'), true, 'DA')), 'accepted', 'same_pick_is_allowed');
select is((select count(*)::int from duel_picks), 1, 'opponent_sees_only_own_pick');
select lives_ok($$update match_tips set home_goals = 1, away_goals = 1 where fixture_id = 9201 and user_id = auth.uid()$$, 'tip_not_locked_by_duel');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from duel_picks), 1, 'challenger_sees_only_own_pick');
select throws_ok($$select cancel_duel((select id from ids where name = 'm1'))$$, 'DUEL_NOT_PENDING', 'accepted_duel_cannot_be_cancelled');
insert into ids select 'm2', id from challenge_match_duel('00000000-0000-0000-0000-0000000000b2', 9202, 5, 'H');
insert into ids select 'm3', id from challenge_match_duel('00000000-0000-0000-0000-0000000000c2', 9203, 5, 'D');
select throws_ok($$select challenge_match_duel('00000000-0000-0000-0000-0000000000e2', 9204, 5, 'A')$$, 'DUEL_MATCH_LIMIT', 'three_match_duels_per_round');
select is((select status from cancel_duel((select id from ids where name = 'm3'))), 'cancelled', 'unanswered_challenge_can_be_cancelled');
insert into ids select 'm4', id from challenge_match_duel('00000000-0000-0000-0000-0000000000e2', 9204, 5, 'A');
select is((select status from duels where id = (select id from ids where name = 'm4')), 'pending', 'cancelled_challenge_frees_the_slot');

select is((select locked from respect_board() where user_id = '00000000-0000-0000-0000-0000000000a2'), 30, 'board_shows_locked_respect');

-- An account without a profile (signed up, never entered the invite code) sees nobody's data.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select is((select count(*)::int from duels), 0, 'non_member_sees_no_duels');
select is((select count(*)::int from respect_board()), 0, 'non_member_sees_no_respect');
select throws_ok($$select respect_free('00000000-0000-0000-0000-0000000000b2')$$, '42501', null, 'respect_free_not_callable_by_clients');

reset role;
update fixtures set kickoff_time = now() - interval '1 minute', started = true where id = 9201;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*)::int from duels where fixture_id = 9201), 1, 'match_duel_public_after_kickoff');
select is((select count(*)::int from duel_picks where duel_id = (select id from ids where name = 'm1')), 2, 'picks_public_after_kickoff');

select * from finish();
rollback;
