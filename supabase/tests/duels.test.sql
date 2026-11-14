begin;
select plan(17);

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
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
insert into profiles (id, nickname) values
  ('00000000-0000-0000-0000-0000000000a2', 'pgtap_duel_a'),
  ('00000000-0000-0000-0000-0000000000b2', 'pgtap_duel_b'),
  ('00000000-0000-0000-0000-0000000000c2', 'pgtap_duel_c'),
  ('00000000-0000-0000-0000-0000000000d2', 'pgtap_duel_d');
-- a has 15 IQ, b has 25, c and d have none.
insert into match_tips (user_id, fixture_id, kind, outcome, points) values
  ('00000000-0000-0000-0000-0000000000a2', 9200, '1x2', 'H', 15),
  ('00000000-0000-0000-0000-0000000000b2', 9200, '1x2', 'H', 25);

create temp table ids (name text primary key, id bigint);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 7)$$, 'DUEL_STAKE_INVALID', 'stake_must_be_5_10_20');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000a2', 5)$$, 'DUEL_INVALID_OPPONENT', 'cannot_challenge_self');
insert into ids select 'ab', id from challenge_duel('00000000-0000-0000-0000-0000000000b2', 10);
select is((select status from duels where id = (select id from ids where name = 'ab')), 'pending', 'challenge_creates_pending');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000b2', 5)$$, 'DUEL_EXISTS', 'one_duel_per_pair');
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000c2', 10)$$, 'DUEL_STAKE_TOO_HIGH', 'open_stakes_cannot_exceed_iq');
insert into ids select 'ac', id from challenge_duel('00000000-0000-0000-0000-0000000000c2', 5);
select throws_ok($$select challenge_duel('00000000-0000-0000-0000-0000000000d2', 5)$$, 'DUEL_LIMIT', 'two_open_duels_per_round');
select throws_ok($$insert into duels (gameweek_id, challenger_id, opponent_id, stake) values (9013, auth.uid(), '00000000-0000-0000-0000-0000000000d2', 5)$$,
  '42501', null, 'direct_insert_forbidden');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select throws_ok($$select respond_duel((select id from ids where name = 'ab'), true)$$, 'DUEL_NOT_YOURS', 'only_opponent_responds');
select throws_ok($$select respond_duel((select id from ids where name = 'ac'), true)$$, 'DUEL_STAKE_TOO_HIGH', 'opponent_needs_the_iq');
select is((select status from respond_duel((select id from ids where name = 'ac'), false)), 'declined', 'opponent_declines');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select status from respond_duel((select id from ids where name = 'ab'), true)), 'accepted', 'opponent_accepts');
select throws_ok($$select respond_duel((select id from ids where name = 'ab'), true)$$, 'DUEL_NOT_PENDING', 'cannot_answer_twice');
insert into ids select 'bd', id from challenge_duel('00000000-0000-0000-0000-0000000000d2', 5);
select throws_ok($$select cancel_duel((select id from ids where name = 'ab'))$$, 'DUEL_NOT_YOURS', 'only_challenger_cancels');
select is((select status from cancel_duel((select id from ids where name = 'bd'))), 'cancelled', 'challenger_cancels_pending');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$select cancel_duel((select id from ids where name = 'ab'))$$, 'DUEL_NOT_PENDING', 'cannot_cancel_accepted');
insert into ids select 'ad', id from challenge_duel('00000000-0000-0000-0000-0000000000d2', 5);
reset role;
update fixtures set started = true where gameweek_id = (select gameweek_id from duels where id = (select id from ids where name = 'ad'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok($$select respond_duel((select id from ids where name = 'ad'), false)$$, 'DUEL_CLOSED', 'no_answer_after_round_starts');
select is((select count(*)::int from duels where challenger_id = '00000000-0000-0000-0000-0000000000a2'), 3, 'duels_readable_by_everyone');

select * from finish();
rollback;
