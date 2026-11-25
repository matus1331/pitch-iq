// Champions League data: a separate competition, see supabase/migrations/0016_champions_league.sql.
import { useQuery } from '@tanstack/react-query'
import type { MatchTip } from '@/components/MatchTipCard'
import type { Fixture } from './data'
import { must, supabase } from './supabase'

export interface ClTeam { id: number; name: string; short_name: string; crest: string | null }

export const useClTeams = () =>
  useQuery({
    queryKey: ['cl', 'teams'],
    queryFn: async () => new Map((must(await supabase.from('cl_teams').select('*')) as ClTeam[]).map((t) => [t.id, t])),
  })

export const useClFixtures = () =>
  useQuery({
    queryKey: ['cl', 'fixtures'],
    queryFn: async () => must(await supabase.from('cl_fixtures').select('*').order('kickoff_time').order('id')) as Fixture[],
  })

/** My tips, and everybody's on matches that kicked off. */
export const useClTips = () =>
  useQuery({
    queryKey: ['cl', 'tips'],
    queryFn: async () => {
      // ponytail: PostgREST returns at most 1000 rows; page this once a season has more tips.
      const rows = must(await supabase.from('cl_match_tips').select('*')) as Omit<MatchTip, 'kind' | 'outcome'>[]
      return rows.map((t): MatchTip => ({ ...t, kind: 'exact', outcome: null }))
    },
  })
