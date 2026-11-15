-- Helpers are for the RPCs and policies only. Supabase gives every function EXECUTE to signed-in users by default,
-- so any account (even without a profile) could call iq_in(<someone>, ...) and read their IQ, past the members-only reads.
-- The RPCs below are security definer and run as their owner, so they keep working.
revoke execute on function iq_total(uuid), iq_in(uuid, text), duel_free_iq(uuid, text, bigint),
  duel_locked_stakes(uuid, text, bigint), duel_open_count(uuid, int, bigint) from public, anon, authenticated;

-- kicked_off() and is_member() stay executable for signed-in users: row-level policies call them as the reader.
revoke execute on function kicked_off(int) from public, anon;

-- Pin the search path of the trigger helpers (Supabase advisor: mutable search_path).
alter function is_client() set search_path = public;
alter function assert_open(int) set search_path = public;
alter function match_tips_guard() set search_path = public;
alter function club_tips_guard() set search_path = public;
alter function profiles_club_lock() set search_path = public;
