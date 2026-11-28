import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { must, supabase } from './supabase'
import type { RoundRow, TipResult } from './standings'

export interface Team { id: number; code: number; name: string; short_name: string }
export interface Profile { id: string; nickname: string; club_team_id: number | null }
export interface Fixture {
  id: number
  gameweek_id: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  started: boolean
  finished_provisional: boolean
  finished: boolean
}
export interface Gameweek { id: number; is_current: boolean; is_next: boolean; finished: boolean }

export function useSession(): Session | null | undefined {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // A stored session can outlive its account (e.g. the user was deleted); ask the server and drop it if so.
      if (data.session && (await supabase.auth.getUser()).error) {
        await supabase.auth.signOut({ scope: 'local' })
        return setSession(null)
      }
      setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      // RLS makes every query depend on who is signed in.
      if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') qc.invalidateQueries()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])
  return session
}

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: async () => must(await supabase.from('profiles').select('*')) as Profile[] })

export function useMyProfile(userId: string | undefined) {
  const q = useProfiles()
  return { ...q, data: q.data?.find((p) => p.id === userId) ?? null }
}

export const useTeams = () =>
  useQuery({
    queryKey: ['teams'],
    staleTime: Infinity,
    queryFn: async () => {
      const rows = must(await supabase.from('teams').select('*').order('name')) as Team[]
      return { list: rows, byId: new Map(rows.map((t) => [t.id, t])) }
    },
  })

export const useGameweeks = () =>
  useQuery({
    queryKey: ['gameweeks'],
    queryFn: async () => must(await supabase.from('gameweeks').select('*').order('id')) as Gameweek[],
  })

/** Scored IQ per player and round, for both competitions (one query feeds profile, header and standings). */
export const useIqRows = () =>
  useQuery({
    queryKey: ['iq'],
    queryFn: async () => {
      const [individual, club] = await Promise.all([
        supabase.from('leaderboard_individual').select('*'),
        supabase.from('leaderboard_club').select('*'),
      ])
      return { individual: must(individual) as RoundRow[], club: must(club) as RoundRow[] }
    },
  })

/** Scored match tips with the real score, for the standings' hit counts and accuracy. */
export const useTipResults = () =>
  useQuery({
    queryKey: ['tip-results'],
    queryFn: async () => {
      // ponytail: PostgREST returns at most 1000 rows; page this once a season has more scored tips.
      const rows = must(await supabase.from('match_tips')
        .select('user_id, kind, home_goals, away_goals, points, fixtures(gameweek_id, team_h_score, team_a_score)')
        .not('points', 'is', null)) as unknown as (Omit<TipResult, 'gameweek_id' | 'team_h_score' | 'team_a_score'> & { fixtures: Pick<TipResult, 'gameweek_id' | 'team_h_score' | 'team_a_score'> | null })[]
      return rows.map(({ fixtures, ...t }) => ({ ...t, ...fixtures })) as TipResult[]
    },
  })

/** Round duels compare result tips ('individual') or club tips ('club', switched off for now); 'match' is one match. */
export type DuelCategory = 'individual' | 'club' | 'match'
/** A match duel pick: H home win, D draw, A away win, or a double chance HD (1X) / DA (X2). */
export type DuelPick = 'H' | 'HD' | 'D' | 'DA' | 'A'

export interface Duel {
  id: number
  category: DuelCategory
  gameweek_id: number
  fixture_id: number | null
  challenger_id: string
  opponent_id: string
  stake: number
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'withdrawn' | 'finished'
  /** Match duels: my own pick, and the opponent's once the match has kicked off (RLS hides it before). */
  duel_picks: { user_id: string; pick: DuelPick }[]
  challenger_iq: number | null
  opponent_iq: number | null
  challenger_delta: number | null
  opponent_delta: number | null
}

export const useDuels = () =>
  useQuery({
    queryKey: ['duels'],
    queryFn: async () => must(await supabase.from('duels').select('*, duel_picks(user_id, pick)').order('created_at')) as Duel[],
  })

/** Everyone's Rešpekt (the duel currency): balance and how much of it is riding on open duels. */
export const useRespect = () =>
  useQuery({
    queryKey: ['duels', 'respect'],
    queryFn: async () => {
      const rows = must(await supabase.rpc('respect_board')) as { user_id: string; total: number; locked: number }[]
      return new Map(rows.map((r) => [r.user_id, { total: r.total, locked: r.locked, free: r.total - r.locked }]))
    },
  })

/** Matches not kicked off yet in the given rounds, for match duels. */
export const useUpcomingFixtures = (gws: number[]) =>
  useQuery({
    queryKey: ['fixtures', 'upcoming', gws],
    enabled: gws.length > 0,
    queryFn: async () => must(await supabase.from('fixtures').select('*').in('gameweek_id', gws)
      .gt('kickoff_time', new Date().toISOString()).order('kickoff_time')) as Fixture[],
  })
