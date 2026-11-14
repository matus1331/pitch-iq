begin;
select plan(22);

-- Test-only data: a played round (9012) for the players' IQ and an open round (9013).
insert into teams (id, code, name, short_name) values (9001, 3, 'Arsenal', 'ARS'), (9009, 11, 'Everton', 'EVE')
  on conflict do nothing;
insert into gameweeks (id) values (9012), (9013) on conflict do nothing;
insert into fixtures (id, gameweek_id, kickoff_time, team_h, team_a, started) values
  (9200, 9012, now() - interval '3 days', 9001, 9009, true),
  (9201, 9013, now() + interval '3 days', 9001, 9009, false);
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
-- a has 15 IQ, b 25, c 5 (the minimum stake), d none, e 10.
insert into match_tips (user_id, fixture_id, kind, outcome, points) values
  ('00000000-0000-0000-0000-0000000000a2', 9200, '1x2', 'H', 15),
  ('00000000-0000-0000-0000-0000000000b2', 9200, '1x2', 'H', 25),
  ('00000000-0000-0000-0000-0000000000c2', 9200, '1x2', 'H', 5),
  ('00000000-0000-0000-0000-0000000000e2', 9200, '1x2', 'H', 10);

create temp table ids (name text primary key, id bigint);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 7, 'individual')$$, 'DUEL_STAKE_INVALID', 'stake_must_be_5_10_20');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000a2', 5, 'individual')$$, 'DUEL_INVALID_OPPONENT', 'cannot_challenge_self');
insert into ids select 'ab', id from challenge_duel('00000000-0000-0000-0000-0000000000b2', 10, 'individual');
select is((select status from duels where id = (select id from ids where name = 'ab')), 'pending', 'challenge_creates_pending');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5, 'individual')$$, 'DUEL_EXISTS', 'one_duel_per_pair');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5, 'club')$$, 'DUEL_EXISTS', 'one_duel_per_pair_across_categories');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000e2', 5, 'club')$$, 'DUEL_NOT_ENOUGH_IQ', 'club_duel_needs_club_iq');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000c2', 10, 'individual')$$, 'DUEL_STAKE_TOO_HIGH', 'open_stakes_cannot_exceed_iq');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000d2', 5, 'individual')$$, 'DUEL_OPPONENT_NO_IQ', 'cannot_challenge_player_without_iq');
insert into ids select 'ac', id from challenge_duel('00000000-0000-0000-0000-0000000000c2', 5, 'individual');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000e2', 5, 'individual')$$, 'DUEL_LIMIT', 'two_open_duels_per_round');
select throws_ok($$insert into duels (gameweek_id, challenger_id, opponent_id, stake) values (9013, auth.uid(), '00000000-0000-0000-0000-0000000000d2', 5)$$,
  '42501', null, 'direct_insert_forbidden');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5, 'individual')$$, 'DUEL_NOT_ENOUGH_IQ', 'locked_below_minimum_iq');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
-- c's unanswered challenge from a does not tie up c's IQ, so b can still challenge c.
insert into ids select 'bc', id from challenge_duel('00000000-0000-0000-0000-0000000000c2', 5, 'individual');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select throws_ok($$select respond_duel((select id from ids where name = 'ab'), true)$$, 'DUEL_NOT_YOURS', 'only_opponent_responds');
select is((select status from respond_duel((select id from ids where name = 'bc'), true)), 'accepted', 'opponent_accepts');
select throws_ok($$select respond_duel((select id from ids where name = 'ac'), true)$$, 'DUEL_STAKE_TOO_HIGH', 'accepting_needs_free_iq');
select is((select status from respond_duel((select id from ids where name = 'ac'), false)), 'declined', 'opponent_declines');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select status from respond_duel((select id from ids where name = 'ab'), true)), 'accepted', 'accept_second_duel');
select throws_ok($$select respond_duel((select id from ids where name = 'ab'), true)$$, 'DUEL_NOT_PENDING', 'cannot_answer_twice');
select throws_ok($$select cancel_duel((select id from ids where name = 'ab'))$$, 'DUEL_NOT_YOURS', 'only_challenger_cancels');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$select cancel_duel((select id from ids where name = 'ab'))$$, 'DUEL_NOT_PENDING', 'cannot_cancel_accepted');
insert into ids select 'ae', id from challenge_duel('00000000-0000-0000-0000-0000000000e2', 5, 'individual');
select is((select status from cancel_duel((select id from ids where name = 'ae'))), 'cancelled', 'challenger_cancels_pending');
insert into ids select 'ae2', id from challenge_duel('00000000-0000-0000-0000-0000000000e2', 5, 'individual');
reset role;
update fixtures set started = true where gameweek_id = (select gameweek_id from duels where id = (select id from ids where name = 'ae2'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select throws_ok($$select respond_duel((select id from ids where name = 'ae2'), false)$$, 'DUEL_CLOSED', 'no_answer_after_round_starts');
select is((select count(*)::int from duels where challenger_id = '00000000-0000-0000-0000-0000000000a2'), 4, 'duels_readable_by_everyone');

select * from finish();
rollback;
