import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const MESSAGES: Record<string, string> = {
  INVALID_INVITE: 'Nesprávny pozývací kód.',
  NICKNAME_TAKEN: 'Prezývka je obsadená.',
  NICKNAME_INVALID: 'Prezývka musí mať 2 až 20 znakov.',
  PROFILE_EXISTS: 'Profil už máš vytvorený.',
  CLUB_TAKEN: 'Tento klub už má iný hráč.',
  CLUB_LOCKED: 'Klub sa počas sezóny nedá zmeniť.',
  TIP_LOCKED: 'Zápas už začal, tip je zamknutý.',
  CLUB_TIP_LIMIT: 'Vybrať môžeš najviac 3 tipy.',
  CLUB_TIP_NOT_OFFERED: 'Tento tip nie je v ponuke pre tento zápas.',
  CLUB_TIP_WRONG_FIXTURE: 'Tipovať môžeš len zápasy svojho klubu.',
  DUEL_STAKE_INVALID: 'Stávka môže byť 5, 10 alebo 20 IQ.',
  DUEL_INVALID_OPPONENT: 'Tohto hráča nemôžeš vyzvať.',
  DUEL_NO_ROUND: 'Momentálne nie je kolo, na ktoré by sa dal duel vyhlásiť.',
  DUEL_EXISTS: 'S týmto hráčom už v tomto kole duel máš.',
  DUEL_LIMIT: 'V jednom kole môžeš mať najviac 2 duely.',
  DUEL_OPPONENT_LIMIT: 'Súper už má v tomto kole 2 duely.',
  DUEL_STAKE_TOO_HIGH: 'Na takú stávku nemáš dosť voľného IQ.',
  DUEL_NOT_YOURS: 'Tento duel nie je tvoj.',
  DUEL_NOT_PENDING: 'Na tento duel sa už odpovedalo.',
  DUEL_CLOSED: 'Kolo už začalo, na výzvu sa už nedá odpovedať.',
}

/** Translate a Supabase/Postgres error into Slovak copy for the UI. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k))
  return code ? MESSAGES[code] : msg
}

/** Throw on Supabase error, return data. */
export function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}
