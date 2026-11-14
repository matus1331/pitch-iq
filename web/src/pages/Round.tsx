import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { type MatchTip, MatchTipCard } from '@/components/MatchTipCard'
import { type Fixture, useGameweeks, useProfiles, useSession, useTeams } from '@/lib/data'
import { defaultRound, splitRound } from '@/lib/roundView'
import { must, supabase } from '@/lib/supabase'

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
  const [picked, setPicked] = useState<number | null>(null)

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

  if (!session || !teams.data) return null
  const userId = session.user.id
  const byUser = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const roundIds = new Set(round.map((f) => f.id))
  const total = (tips.data ?? []).filter((t) => t.user_id === userId && roundIds.has(t.fixture_id))
    .reduce((s, t) => s + (t.points ?? 0), 0)
  const card = (f: Fixture) => (
    <MatchTipCard
      key={f.id}
      fixture={f}
      home={teams.data.byId.get(f.team_h)!}
      away={teams.data.byId.get(f.team_a)!}
      myTip={tips.data?.find((t) => t.fixture_id === f.id && t.user_id === userId)}
      others={(tips.data ?? []).filter((t) => t.fixture_id === f.id && t.user_id !== userId)}
      profiles={byUser}
      userId={userId}
      onSaved={() => qc.invalidateQueries({ queryKey: ['match_tips', gw] })}
    />
  )

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-4xl leading-none">{gw ? `${gw}. kolo` : 'Kolo'}</h1>
          <p className="opacity-80">Tvoje IQ body v tomto kole: {total}</p>
        </div>
        {options.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-black/20 p-1 text-sm">
            {options.map((o) => (
              <button key={o} onClick={() => setPicked(o)} aria-pressed={o === gw}
                className={`rounded-md px-3 py-1 font-semibold ${o === gw ? 'bg-white text-neutral-900' : ''}`}>
                {o}. kolo
              </button>
            ))}
          </div>
        )}
      </div>
      {fixtures.isLoading && <p>Načítavam zápasy…</p>}
      {fixtures.data?.length === 0 && <p>Pre toto kolo zatiaľ nie sú zápasy.</p>}
      <div className="space-y-3">{round.map(card)}</div>
      {postponed.length > 0 && (
        <>
          <h2 className="font-heading mt-8 mb-3 text-2xl">Odložené zápasy</h2>
          <div className="space-y-3">{postponed.map(card)}</div>
        </>
      )}
    </section>
  )
}
