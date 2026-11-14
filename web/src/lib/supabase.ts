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
