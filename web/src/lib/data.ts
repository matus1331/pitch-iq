import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { must, supabase } from './supabase'
import type { RoundRow } from './standings'

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

export interface Duel {
  id: number
  gameweek_id: number
  challenger_id: string
  opponent_id: string
  stake: number
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'finished'
  challenger_iq: number | null
  opponent_iq: number | null
  challenger_delta: number | null
  opponent_delta: number | null
}

export const useDuels = () =>
  useQuery({
    queryKey: ['duels'],
    queryFn: async () => must(await supabase.from('duels').select('*').order('created_at')) as Duel[],
  })
