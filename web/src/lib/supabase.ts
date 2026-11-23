import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Nesprávny e-mail alebo heslo.',
  'User already registered': 'Účet s týmto e-mailom už existuje. Prihlás sa.',
  'Password should be at least': 'Heslo je príliš krátke.',
  'Failed to fetch': 'Nepodarilo sa spojiť so serverom. Skontroluj pripojenie.',
  INVALID_INVITE: 'Nesprávny pozývací kód.',
  profiles_id_fkey: 'Tvoje prihlásenie už neplatí. Odhlás sa a prihlás sa znova.',
  NICKNAME_TAKEN: 'Prezývka je obsadená.',
  NICKNAME_INVALID: 'Prezývka musí mať 2 až 20 znakov.',
  PROFILE_EXISTS: 'Profil už máš vytvorený.',
  CLUB_TAKEN: 'Tento klub už má iný hráč.',
  CLUB_LOCKED: 'Klub sa počas sezóny nedá zmeniť.',
  TIP_LOCKED: 'Zápas už začal, tip je zamknutý.',
  TIP_EXACT_ONLY: 'Od 12. kola sa tipuje len presný výsledok.',
  CLUB_TIP_LIMIT: 'Vybrať môžeš najviac 3 tipy.',
  CLUB_TIP_NOT_OFFERED: 'Tento tip nie je v ponuke pre tento zápas.',
  CLUB_TIP_WRONG_FIXTURE: 'Tipovať môžeš len zápasy svojho klubu.',
  LINEUP_WRONG_FIXTURE: 'Zostavu môžeš postaviť len na zápasy svojho klubu.',
  LINEUP_LOCKED: 'Zápas už začal, zostava je zamknutá.',
  LINEUP_WRONG_PLAYER: 'Tento hráč nehrá za tvoj klub.',
  LINEUP_WRONG_SLOT: 'Tento hráč na toto miesto v zostave nepatrí.',
  LINEUP_PLAYER_OUT: 'Tento hráč teraz nemôže hrať, vyber iného.',
  club_lineups_user_id_fixture_id_player_id_key: 'Tento hráč už v zostave je.',
  TIP_FIXTURE_IMMUTABLE: 'Zápas sa pri tipe ani zostave meniť nedá.',
  DUEL_STAKE_INVALID: 'Stávka môže byť 5, 10 alebo 20 R.',
  DUEL_INVALID_OPPONENT: 'Tohto hráča nemôžeš vyzvať.',
  DUEL_NO_ROUND: 'Momentálne nie je kolo, na ktoré by sa dal duel vyhlásiť.',
  DUEL_EXISTS: 'S týmto hráčom už v tomto kole (alebo na tento zápas) duel máš alebo si ho mal.',
  DUEL_LIMIT: 'V jednom kole môžeš mať najviac 2 duely.',
  DUEL_OPPONENT_LIMIT: 'Súper už má v tomto kole 2 duely.',
  DUEL_STAKE_TOO_HIGH: 'Na takú stávku nemáš dosť voľného Rešpektu.',
  DUEL_NOT_ENOUGH_R: 'Na duel potrebuješ aspoň 10 voľného Rešpektu.',
  DUEL_CATEGORY_INVALID: 'Duely o Klub zatiaľ nie sú dostupné.',
  DUEL_OPPONENT_NO_R: 'Súper nemá aspoň 10 voľného Rešpektu alebo dosť na takú stávku.',
  DUEL_MATCH_LIMIT: 'V jednom kole môžeš mať najviac 3 zápasové duely (aj odmietnuté po prijatí).',
  DUEL_OPPONENT_MATCH_LIMIT: 'Súper už má v tomto kole 3 zápasové duely.',
  DUEL_FIXTURE_INVALID: 'Na tento zápas sa duel už nedá vyhlásiť.',
  DUEL_NEEDS_TIP: 'Najprv si tento zápas natipuj, duel prijmeš so svojím tipom.',
  DUEL_NOT_PICKABLE: 'Stranu si v tomto dueli už vybrať nemôžeš.',
  DUEL_PICK_INVALID: 'Túto možnosť má súper, vyber inú.',
  TIP_DUEL_LOCKED: 'Máš prijatý duel na tento zápas: skóre môžeš zmeniť, víťaza (1/X/2) už nie.',
  DUEL_NOT_YOURS: 'Tento duel nie je tvoj.',
  DUEL_NOT_PENDING: 'Na tento duel sa už odpovedalo.',
  PUSH_INVALID: 'Notifikácie sa nepodarilo zapnúť. Skús to znova.',
  DUEL_CLOSED: 'Zápas alebo kolo už začalo, na duel sa už nedá odpovedať.',
}

/** Translate a Supabase/Postgres error into Slovak copy for the UI. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k))
  if (code) return MESSAGES[code]
  // Unknown errors can carry database details; keep those in the console, not on screen.
  console.error(e)
  return 'Niečo sa pokazilo. Skús to znova.'
}

/** Throw on Supabase error, return data. */
export function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}
