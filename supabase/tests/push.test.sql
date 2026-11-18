begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'a7@test.local'),
  ('00000000-0000-0000-0000-0000000000b7', 'b7@test.local');
insert into profiles (id, nickname) values
  ('00000000-0000-0000-0000-0000000000a7', 'pgtap_push_a'),
  ('00000000-0000-0000-0000-0000000000b7', 'pgtap_push_b');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
select lives_ok($$select save_push_subscription('https://push.test/1', 'k', 'a')$$, 'save_ok');
select throws_ok($$select save_push_subscription('http://evil/1', 'k', 'a')$$, 'PUSH_INVALID', 'needs_https');
select throws_ok($$insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values ('https://push.test/x', '00000000-0000-0000-0000-0000000000b7', 'k', 'a')$$, '42501', null, 'direct_insert_forbidden');
select is((select count(*)::int from notifications_sent), 0, 'notifications_sent_invisible');

-- Another account on the same device takes the endpoint over.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}';
select save_push_subscription('https://push.test/1', 'k2', 'a2');
select is((select count(*)::int from push_subscriptions), 1, 'sees_own_after_takeover');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
select is((select count(*)::int from push_subscriptions), 0, 'cannot_see_others');
delete from push_subscriptions;
reset role;
select is((select user_id from push_subscriptions where endpoint = 'https://push.test/1'),
  '00000000-0000-0000-0000-0000000000b7'::uuid, 'cannot_delete_others');

select * from finish();
rollback;
