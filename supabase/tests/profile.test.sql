begin;
select plan(9);

insert into app_config (key, value) values ('invite_code', 'kamosi26')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local');
insert into teams (id, code, name, short_name) values (9001, 3, 'Arsenal', 'ARS'), (9009, 11, 'Everton', 'EVE')
  on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok($$select complete_profile('pgtap_x', 'zle')$$, 'INVALID_INVITE', 'wrong_invite');
select throws_ok($$select complete_profile('a', 'kamosi26')$$, 'NICKNAME_INVALID', 'nickname_too_short');
select throws_ok($$insert into profiles (id, nickname) values (auth.uid(), 'hack')$$, '42501', null, 'direct_insert_forbidden');
select is((select nickname from complete_profile('  pgtap_alfa ', 'kamosi26')), 'pgtap_alfa', 'ok_creates_profile_trimmed');
select throws_ok($$select complete_profile('pgtap_alfa2', 'kamosi26')$$, 'PROFILE_EXISTS', 'profile_exists');
select is((select club_team_id from choose_club(9009)), 9009, 'choose_club_ok');
select throws_ok($$select choose_club(9001)$$, 'CLUB_LOCKED', 'choose_second_time');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select complete_profile('pgtap_beta', 'kamosi26');
select throws_ok($$select choose_club(9009)$$, 'CLUB_TAKEN', 'choose_taken_club');

reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$select complete_profile('PGTAP_ALFA', 'kamosi26')$$, 'NICKNAME_TAKEN', 'duplicate_nickname_case_insensitive');

select * from finish();
rollback;
