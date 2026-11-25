import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CardsSkeleton } from '@/components/Skeleton'
import type { MatchTip } from '@/components/MatchTipCard'
import { RoundHeader } from '@/components/RoundHeader'
import { RoundMatches } from '@/components/RoundMatches'
import { badgeUrl } from '@/lib/clubColors'
import { type Fixture, useGameweeks, useProfiles, useSession, useTeams } from '@/lib/data'
import { defaultRound, splitRound } from '@/lib/roundView'
import { must, supabase } from '@/lib/supabase'
import { WelcomeCard } from './HowToPlay'

export function useRoundGws() {
  const gws = useGameweeks()
  const current = gws.data?.find((g) => g.is_current)?.id
  const next = gws.data?.find((g) => g.is_next)?.id
  return [current, next].filter((x): x is number => x != null)
}

export function Round() {
  const qc = useQueryClient()
  const session = useSession()
  const teams = useTeams()
  const profiles = useProfiles()
  const options = useRoundGws()
  // A link like /?kolo=12&zapas=119 (from a duel) opens that round and scrolls to the match.
  const [params] = useSearchParams()
  const target = Number(params.get('zapas')) || null
  const [picked, setPicked] = useState<number | null>(Number(params.get('kolo')) || null)

  const all = useQuery({
    queryKey: ['fixtures', options],
    enabled: options.length > 0,
    queryFn: async () =>
      must(await supabase.from('fixtures').select('*')
        .or(`gameweek_id.in.(${options.join(',')}),gameweek_id.is.null`).order('kickoff_time')) as Fixture[],
  })
  const gw = picked ?? defaultRound(all.data ?? [], options)
  const { round, postponed } = splitRound(all.data ?? [], gw)
  const fixtures = { ...all, data: all.data && round }
  const ids = [...round, ...postponed].map((f) => f.id)
  const tips = useQuery({
    queryKey: ['match_tips', gw],
    enabled: ids.length > 0,
    queryFn: async () => must(await supabase.from('match_tips').select('*').in('fixture_id', ids)) as MatchTip[],
  })

  if (!session || !teams.data) return <CardsSkeleton />
  const userId = session.user.id
  const byUser = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const roundIds = new Set(round.map((f) => f.id))
  const total = (tips.data ?? []).filter((t) => t.user_id === userId && roundIds.has(t.fixture_id))
    .reduce((s, t) => s + (t.points ?? 0), 0)
  return (
    <section>
      <RoundHeader gw={gw} total={total} options={options} nameOf={(o) => `${o}. kolo`} onPick={setPicked} />
      <WelcomeCard userId={userId} />
      {fixtures.isLoading && <CardsSkeleton />}
      {fixtures.data?.length === 0 && <p>Pre toto kolo zatiaľ nie sú zápasy.</p>}
      {all.data && <RoundMatches
        round={round}
        postponed={postponed}
        tips={tips.data ?? []}
        teamOf={(id) => {
          const t = teams.data.byId.get(id)!
          return { name: t.name, short_name: t.short_name, badge: badgeUrl(t.code) }
        }}
        profiles={byUser}
        userId={userId}
        save={(fixture_id, tip) => supabase.from('match_tips').upsert({ user_id: userId, fixture_id, ...tip })}
        onSaved={() => qc.invalidateQueries({ queryKey: ['match_tips', gw] })}
        target={target}
      />}
    </section>
  )
}
