-- The sync function pushes a new challenge to the challenged player and the answer (accepted / declined)
-- back to the challenger, once each, and marks it here.
alter table duels
  add column challenge_notified boolean not null default false,
  add column answer_notified boolean not null default false;
-- Challenges and answers from before this migration are not announced.
update duels set challenge_notified = true, answer_notified = true;
