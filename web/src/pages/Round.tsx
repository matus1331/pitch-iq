import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { CardsSkeleton } from '@/components/Skeleton'
import { type MatchTip, MatchTipCard } from '@/components/MatchTipCard'
import { type Fixture, useGameweeks, useProfiles, useSession, useTeams } from '@/lib/data'
import { defaultRound, splitRound } from '@/lib/roundView'
import { must, supabase } from '@/lib/supabase'
import { timeLeft } from '@/lib/time'
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

  // Re-render every minute so the countdown stays true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  if (!session || !teams.data) return <CardsSkeleton />
  const userId = session.user.id
  const byUser = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const roundIds = new Set(round.map((f) => f.id))
  const total = (tips.data ?? []).filter((t) => t.user_id === userId && roundIds.has(t.fixture_id))
    .reduce((s, t) => s + (t.points ?? 0), 0)
  const open = round.filter((f) => f.kickoff_time && Date.parse(f.kickoff_time) > now)
  const tipped = open.filter((f) => tips.data?.some((t) => t.fixture_id === f.id && t.user_id === userId)).length
  const nextKickoff = open.find((f) => !tips.data?.some((t) => t.fixture_id === f.id && t.user_id === userId)) ?? open[0]
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
          <p>Tvoje IQ v tomto kole: <b>{total}</b></p>
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
      <WelcomeCard userId={userId} />
      {open.length > 0 && (
        <div className="mb-4 rounded-xl bg-black/25 p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Natipované {tipped} z {open.length} {open.length === 1 ? 'zápasu' : 'zápasov'}</p>
            <span className="scoreboard text-xl">{tipped}/{open.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-[var(--club-secondary)] transition-[width] duration-500" style={{ width: `${(tipped / open.length) * 100}%` }} />
          </div>
          {nextKickoff?.kickoff_time && (
            <p className="mt-2 text-sm">
              {tipped < open.length ? 'Najbližší nenatipovaný zápas' : 'Najbližší zápas'} začína o {timeLeft(Date.parse(nextKickoff.kickoff_time) - now)}. Tip sa zamkne pri výkope.
            </p>
          )}
        </div>
      )}
      {fixtures.isLoading && <CardsSkeleton />}
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
